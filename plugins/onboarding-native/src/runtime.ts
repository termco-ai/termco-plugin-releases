import type {
  ActiveOnboardingSnapshot,
  OnboardingJourney,
  OnboardingJourneySnapshot,
  OnboardingRegistry,
  OnboardingRuntime,
  OnboardingSnapshot,
  OnboardingStep,
  OnboardingStepContext,
  OnboardingStepStatus,
} from "@termco/onboarding-base";
import type { ContributionOwner } from "@termco/kernel";
import type { PreferencesCapability } from "@termco/storage-base";

const PROGRESS_KEY = "onboarding.progress.v1";
const DISMISSALS_KEY = "onboarding.dismissals.v1";
type ProgressValue = { version: number; status: "complete" | "skipped" };
type ProgressState = Record<string, ProgressValue>;
type DismissalState = Record<string, true>;

function isProgressState(value: unknown): value is ProgressState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    return Number.isInteger(record.version) &&
      (record.status === "complete" || record.status === "skipped");
  });
}

function isDismissalState(value: unknown): value is DismissalState {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((entry) => entry === true);
}

function scopeId(step: OnboardingStep, context: OnboardingStepContext): string {
  if (step.scope.kind === "user") return "user";
  return context[`${step.scope.kind}Id`] ?? `current-${step.scope.kind}`;
}

function progressKey(
  owner: ContributionOwner,
  journey: OnboardingJourney,
  step: OnboardingStep,
  context: OnboardingStepContext,
): string {
  return [owner.pluginId, journey.id, step.id, step.scope.kind, scopeId(step, context)].join("/");
}

function offerKey(
  owner: ContributionOwner,
  journey: OnboardingJourney,
  context: OnboardingStepContext,
): string {
  return [owner.pluginId, journey.id, context.profileId ?? "user"].join("/");
}

export async function createOnboardingRuntime(
  registry: OnboardingRegistry,
  preferences: PreferencesCapability,
): Promise<OnboardingRuntime & { dispose(): void }> {
  const [storedProgress, storedDismissals] = await Promise.all([
    preferences.get(PROGRESS_KEY),
    preferences.get(DISMISSALS_KEY),
  ]);
  let progress: ProgressState = isProgressState(storedProgress) ? { ...storedProgress } : {};
  let dismissals: DismissalState = isDismissalState(storedDismissals) ? { ...storedDismissals } : {};
  let context: OnboardingStepContext = {};
  let revision = 0;
  let active: ActiveOnboardingSnapshot | null = null;
  let suggestedJourneyId: string | null = null;
  let cached: OnboardingSnapshot = { revision, journeys: [], active, offer: null };
  const listeners = new Set<() => void>();

  const definitions = () => registry.records().flatMap((record) =>
    (record.value.journeys ?? []).map((journey) => ({
      journey,
      owner: {
        pluginId: record.pluginId,
        generation: record.generation,
        key: record.key,
      },
    }))
  ).sort((left, right) =>
    (left.journey.order ?? 0) - (right.journey.order ?? 0) ||
    left.journey.title.localeCompare(right.journey.title)
  );

  const statusOf = (
    owner: ContributionOwner,
    journey: OnboardingJourney,
    step: OnboardingStep,
  ): OnboardingStepStatus => {
    const value = progress[progressKey(owner, journey, step, context)];
    return value?.version === step.version ? value.status : "available";
  };

  const rebuild = () => {
    const currentDefinitions = definitions();
    const journeys: OnboardingJourneySnapshot[] = currentDefinitions.map(({ journey, owner }) => {
      const steps = journey.steps.map((step) => ({
        id: step.id,
        title: step.title,
        optional: step.optional === true,
        status: statusOf(owner, journey, step),
        step,
      }));
      const completedSteps = steps.filter((step) => step.status !== "available").length;
      return {
        id: journey.id,
        title: journey.title,
        description: journey.description,
        ...(journey.estimatedMinutes === undefined
          ? {}
          : { estimatedMinutes: journey.estimatedMinutes }),
        presentation: journey.presentation ?? "available",
        owner,
        completedSteps,
        totalSteps: steps.length,
        complete: completedSteps === steps.length,
        steps,
      };
    });
    const suggested = active || !suggestedJourneyId
      ? undefined
      : journeys.find((journey) => journey.id === suggestedJourneyId);
    const automatic = active || suggested ? undefined : journeys.find((journey) =>
      journey.presentation === "automatic" &&
      journey.completedSteps === 0 &&
      !dismissals[offerKey(
        journey.owner,
        currentDefinitions.find((entry) => entry.journey.id === journey.id)!.journey,
        context,
      )]
    );
    cached = {
      revision,
      journeys,
      active,
      offer: (suggested ?? automatic) ? {
        journeyId: (suggested ?? automatic)!.id,
        title: (suggested ?? automatic)!.title,
        description: (suggested ?? automatic)!.description,
        presentation: (suggested ?? automatic)!.presentation,
      } : null,
    };
  };

  const publish = () => {
    revision += 1;
    rebuild();
    for (const listener of listeners) listener();
  };
  const persist = async () => preferences.set(PROGRESS_KEY, progress);
  const selected = () => {
    if (!active) return undefined;
    const definition = definitions().find((entry) => entry.journey.id === active?.journeyId);
    const step = definition?.journey.steps[active.stepIndex];
    return definition && step ? { ...definition, step } : undefined;
  };
  const moveAfterCompletion = () => {
    const current = selected();
    if (!current || !active) {
      active = null;
      return;
    }
    const nextIndex = current.journey.steps.findIndex((step, index) =>
      index > active!.stepIndex && statusOf(current.owner, current.journey, step) === "available"
    );
    if (nextIndex < 0) {
      active = null;
      return;
    }
    active = {
      journeyId: current.journey.id,
      stepIndex: nextIndex,
      stepId: current.journey.steps[nextIndex]!.id,
      busy: false,
    };
  };
  const markCurrent = async (status: "complete" | "skipped") => {
    const current = selected();
    if (!current) return;
    progress = {
      ...progress,
      [progressKey(current.owner, current.journey, current.step, context)]: {
        version: current.step.version,
        status,
      },
    };
    await persist();
    moveAfterCompletion();
    publish();
  };

  const removeRegistrySubscription = registry.subscribe(() => {
    if (active && !definitions().some((entry) => entry.journey.id === active?.journeyId)) {
      active = null;
    }
    if (
      suggestedJourneyId &&
      !definitions().some((entry) => entry.journey.id === suggestedJourneyId)
    ) {
      suggestedJourneyId = null;
    }
    publish();
  });
  const removePreferenceSubscription = preferences.subscribe((key, value) => {
    if (key === PROGRESS_KEY && isProgressState(value)) progress = { ...value };
    else if (key === DISMISSALS_KEY && isDismissalState(value)) dismissals = { ...value };
    else return;
    publish();
  });
  rebuild();

  const retryCheck = async () => {
    const current = selected();
    if (!current || current.step.kind !== "check" || !active) return;
    active = { ...active, busy: true, message: undefined };
    publish();
    try {
      const result = await current.step.check(context);
      if (result.satisfied) {
        await markCurrent("complete");
      } else {
        active = { ...active, busy: false, message: result.detail ?? result.summary };
        publish();
      }
    } catch (error) {
      active = { ...active, busy: false, message: error instanceof Error ? error.message : String(error) };
      publish();
    }
  };

  const prepareAction = async () => {
    const current = selected();
    if (!current || current.step.kind !== "action" || !active) return;
    active = { ...active, busy: true, message: undefined };
    publish();
    try {
      const preview = await current.step.prepare(context);
      active = { ...active, busy: false, actionPreview: preview };
      publish();
    } catch (error) {
      active = { ...active, busy: false, message: error instanceof Error ? error.message : String(error) };
      publish();
    }
  };

  const runPreparedAction = async () => {
    const current = selected();
    if (!current || current.step.kind !== "action" || !active?.actionPreview) return;
    const preview = active.actionPreview;
    active = { ...active, busy: true, message: undefined };
    publish();
    try {
      const result = await current.step.run(context, { token: preview.token });
      if (result.ok) await markCurrent("complete");
      else {
        active = { ...active, busy: false, message: result.detail ?? result.summary };
        publish();
      }
    } catch (error) {
      active = { ...active, busy: false, message: error instanceof Error ? error.message : String(error) };
      publish();
    }
  };

  return {
    snapshot: () => cached,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setContext(next) {
      context = { ...next };
      publish();
    },
    async suggest(journeyId) {
      const definition = definitions().find((entry) => entry.journey.id === journeyId);
      if (!definition || active) return false;
      const journey = cached.journeys.find((entry) => entry.id === journeyId);
      if (
        !journey ||
        journey.complete ||
        journey.completedSteps > 0 ||
        dismissals[offerKey(definition.owner, definition.journey, context)]
      ) {
        return false;
      }
      suggestedJourneyId = journeyId;
      publish();
      return true;
    },
    async start(journeyId) {
      const definition = definitions().find((entry) => entry.journey.id === journeyId);
      if (!definition) throw new Error(`onboarding journey "${journeyId}" is unavailable`);
      const index = definition.journey.steps.findIndex((step) =>
        statusOf(definition.owner, definition.journey, step) === "available"
      );
      const stepIndex = index < 0 ? 0 : index;
      active = {
        journeyId,
        stepIndex,
        stepId: definition.journey.steps[stepIndex]!.id,
        busy: false,
      };
      if (suggestedJourneyId === journeyId) suggestedJourneyId = null;
      publish();
    },
    async dismissOffer() {
      const offered = cached.offer;
      if (!offered) return;
      const definition = definitions().find((entry) => entry.journey.id === offered.journeyId);
      if (!definition) return;
      dismissals = {
        ...dismissals,
        [offerKey(definition.owner, definition.journey, context)]: true,
      };
      if (suggestedJourneyId === offered.journeyId) suggestedJourneyId = null;
      await preferences.set(DISMISSALS_KEY, dismissals);
      publish();
    },
    async next() {
      const current = selected();
      if (!current) return;
      if (current.step.kind === "interaction") return;
      if (current.step.kind === "check") {
        await retryCheck();
        return;
      }
      if (current.step.kind === "action") {
        await prepareAction();
        return;
      }
      await markCurrent("complete");
    },
    back() {
      if (!active) return;
      const current = selected();
      if (!current) return;
      const stepIndex = Math.max(0, active.stepIndex - 1);
      active = {
        journeyId: active.journeyId,
        stepIndex,
        stepId: current.journey.steps[stepIndex]!.id,
        busy: false,
      };
      publish();
    },
    skip: () => markCurrent("skipped"),
    close() {
      active = null;
      publish();
    },
    completeCurrent: () => markCurrent("complete"),
    retryCheck,
    prepareAction,
    runPreparedAction,
    async resetJourney(journeyId) {
      const definition = definitions().find((entry) => entry.journey.id === journeyId);
      if (!definition) return;
      const keys = new Set(definition.journey.steps.map((step) =>
        progressKey(definition.owner, definition.journey, step, context)
      ));
      progress = Object.fromEntries(Object.entries(progress).filter(([key]) => !keys.has(key)));
      if (active?.journeyId === journeyId) active = null;
      await persist();
      publish();
    },
    async resetAll() {
      progress = {};
      active = null;
      await persist();
      publish();
    },
    target(targetId) {
      return registry.records().flatMap((record) => record.value.targets ?? [])
        .find((target) => target.id === targetId);
    },
    dispose() {
      removeRegistrySubscription();
      removePreferenceSubscription();
      listeners.clear();
    },
  };
}
