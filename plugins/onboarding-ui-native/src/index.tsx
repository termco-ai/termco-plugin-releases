import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Compass01Icon,
  PlayIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Dispose, PluginModule } from "@termco/kernel";
import {
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRichContent,
  type OnboardingRuntime,
  type OnboardingStep,
  type OnboardingTargetLease,
} from "@termco/onboarding-base";
import ui from "@termco/ui";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandRegistry,
} from "@termco/ui-commands-base";
import {
  UI_OVERLAYS_SERVICE,
  type UiOverlayRegistry,
} from "@termco/ui-overlays-base";
import {
  UI_SETTINGS_SECTIONS_SERVICE,
  UI_SETTINGS_VIEW_SERVICE,
  type UiSettingsSectionRegistry,
  type UiSettingsViewCapability,
} from "@termco/ui-settings-base";

const { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } = ui.React;

export function Content({ content }: { content: OnboardingRichContent | undefined }) {
  if (!content) return null;
  return (
    <div className="space-y-3">
      <ui.Streamdown className="text-sm leading-relaxed text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]">
        {content.markdown}
      </ui.Streamdown>
      {content.media?.kind === "video" ? (
        <video
          controls
          preload="metadata"
          src={content.media.source}
          aria-label={content.media.alt}
          className="max-h-56 w-full rounded-lg border border-border bg-black object-contain"
        />
      ) : content.media ? (
        <img
          src={content.media.source}
          alt={content.media.alt}
          className="max-h-56 w-full rounded-lg border border-border object-contain"
        />
      ) : null}
      {content.media?.captions ? (
        <p className="text-xs text-muted-foreground">{content.media.captions}</p>
      ) : null}
    </div>
  );
}

function stepContent(step: OnboardingStep): OnboardingRichContent | undefined {
  return "body" in step ? step.body : undefined;
}

export function OnboardingSettings({ runtime }: { runtime: OnboardingRuntime }) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6" data-testid="onboarding-section">
      <section>
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Learn Termco through real work</h2>
            <p className="mt-1 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
              Each journey opens the actual feature and remembers your progress. Start anywhere, close at any time, and replay it later.
            </p>
          </div>
          {snapshot.journeys.some((journey) => journey.completedSteps > 0) ? (
            <button
              type="button"
              onClick={() => void run(() => runtime.resetAll())}
              className="termco-focus-ring inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.8} />
              Reset all
            </button>
          ) : null}
        </div>

        {snapshot.journeys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center">
            <HugeiconsIcon icon={Compass01Icon} size={24} className="mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No onboarding journeys are active</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enable a plugin that contributes onboarding to see it here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {snapshot.journeys.map((journey) => (
              <article key={journey.id} className="px-4 py-4" data-testid={`onboarding-journey-${journey.id}`}>
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${
                    journey.complete ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
                  }`}>
                    <HugeiconsIcon icon={journey.complete ? CheckmarkCircle02Icon : Compass01Icon} size={17} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-sm font-semibold">{journey.title}</h3>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {journey.completedSteps}/{journey.totalSteps}
                        {journey.estimatedMinutes ? ` · ${journey.estimatedMinutes} min` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{journey.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${journey.title} steps`}>
                      {journey.steps.map((step, index) => (
                        <span
                          key={step.id}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                            step.status === "complete"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : step.status === "skipped"
                                ? "bg-muted text-muted-foreground line-through"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {step.status === "complete" ? (
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} strokeWidth={2} />
                          ) : null}
                          {index + 1}. {step.title}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {journey.completedSteps > 0 ? (
                      <button
                        type="button"
                        aria-label={`Reset ${journey.title}`}
                        onClick={() => void run(() => runtime.resetJourney(journey.id))}
                        className="termco-focus-ring flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.8} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void run(() => runtime.start(journey.id))}
                      className="termco-focus-ring inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <HugeiconsIcon icon={journey.complete ? RefreshIcon : PlayIcon} size={13} strokeWidth={1.9} />
                      {journey.complete ? "Replay" : journey.completedSteps > 0 ? "Continue" : "Start"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {message ? <p role="alert" className="mt-3 text-xs text-destructive">{message}</p> : null}
      </section>
    </div>
  );
}

type TargetRect = { top: number; left: number; right: number; bottom: number; width: number; height: number };
type CoachSize = { width: number; height: number };
type CoachPlacement = "top" | "right" | "bottom" | "left";

const COACH_MARGIN = 20;
const COACH_GAP = 18;
const STATUS_BAR_GUTTER = 36;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function overlapArea(
  left: number,
  top: number,
  size: CoachSize,
  target: TargetRect,
): number {
  const width = Math.max(0, Math.min(left + size.width, target.right + 8) - Math.max(left, target.left - 8));
  const height = Math.max(0, Math.min(top + size.height, target.bottom + 8) - Math.max(top, target.top - 8));
  return width * height;
}

function coachPosition(
  target: TargetRect | null,
  size: CoachSize,
  preferred?: CoachPlacement,
): { left: number; top: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = viewportWidth - size.width - COACH_MARGIN;
  const maxTop = viewportHeight - size.height - STATUS_BAR_GUTTER;
  if (!target) {
    return {
      left: clamp(maxLeft, COACH_MARGIN, maxLeft),
      top: clamp(maxTop, COACH_MARGIN, maxTop),
    };
  }

  const available: Record<CoachPlacement, number> = {
    left: target.left - COACH_MARGIN,
    right: viewportWidth - target.right - COACH_MARGIN,
    top: target.top - COACH_MARGIN,
    bottom: viewportHeight - STATUS_BAR_GUTTER - target.bottom,
  };
  const directions: CoachPlacement[] = ["left", "right", "top", "bottom"];
  directions.sort((a, b) => {
    if (a === preferred) return -1;
    if (b === preferred) return 1;
    return available[b] - available[a];
  });

  const candidates = directions.map((direction, priority) => {
    const raw = direction === "left"
      ? { left: target.left - COACH_GAP - size.width, top: target.top + (target.height - size.height) / 2 }
      : direction === "right"
        ? { left: target.right + COACH_GAP, top: target.top + (target.height - size.height) / 2 }
        : direction === "top"
          ? { left: target.left + (target.width - size.width) / 2, top: target.top - COACH_GAP - size.height }
          : { left: target.left + (target.width - size.width) / 2, top: target.bottom + COACH_GAP };
    const position = {
      left: clamp(raw.left, COACH_MARGIN, maxLeft),
      top: clamp(raw.top, COACH_MARGIN, maxTop),
    };
    return {
      ...position,
      score: overlapArea(position.left, position.top, size, target) * 1_000 + priority,
    };
  });
  return candidates.sort((a, b) => a.score - b.score)[0]!;
}

export function AutomaticOffer({
  runtime,
  settings,
}: {
  runtime: OnboardingRuntime;
  settings: UiSettingsViewCapability;
}) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  const settingsSnapshot = useSyncExternalStore(settings.subscribe, settings.snapshot, settings.snapshot);
  const offer = snapshot.offer;
  if (!offer || snapshot.active || settingsSnapshot.open) return null;
  return (
    <section
      aria-label="Getting started"
      className="fixed right-5 bottom-9 z-[89] w-[min(390px,calc(100vw-40px))] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-[0_18px_55px_rgba(0,0,0,0.28)]"
      data-testid="onboarding-offer"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <HugeiconsIcon icon={Compass01Icon} size={17} strokeWidth={1.8} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            {offer.presentation === "automatic" ? "Your profile is ready" : "Learn this feature"}
          </div>
          <h2 className="mt-1 text-sm font-semibold">{offer.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{offer.description}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void runtime.dismissOffer()}
          className="termco-focus-ring h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => void runtime.start(offer.journeyId)}
          className="termco-focus-ring inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={1.9} />
          Take guided tour
        </button>
      </div>
    </section>
  );
}

function OnboardingOverlay({
  runtime,
  settings,
}: {
  runtime: OnboardingRuntime;
  settings: UiSettingsViewCapability;
}) {
  return (
    <>
      <AutomaticOffer runtime={runtime} settings={settings} />
      <CoachMark runtime={runtime} />
    </>
  );
}

function CoachMark({ runtime }: { runtime: OnboardingRuntime }) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.snapshot, runtime.snapshot);
  const active = snapshot.active;
  const journey = snapshot.journeys.find((candidate) => candidate.id === active?.journeyId);
  const stepSnapshot = journey?.steps[active?.stepIndex ?? -1];
  const step = stepSnapshot?.step;
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [targetMessage, setTargetMessage] = useState<string | null>(null);
  const [coachSize, setCoachSize] = useState<CoachSize>({ width: 400, height: 280 });
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!active || !step) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, [active?.journeyId, active?.stepId]);

  useEffect(() => {
    if (!active || !step) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      runtime.close();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active?.stepId, runtime, step]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const measure = () => {
      const next = dialog.getBoundingClientRect();
      setCoachSize((current) =>
        Math.abs(current.width - next.width) < 1 && Math.abs(current.height - next.height) < 1
          ? current
          : { width: next.width, height: next.height }
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [active?.stepId]);

  useEffect(() => {
    let lease: OnboardingTargetLease | undefined;
    let stopObservation: Dispose | undefined;
    let cancelled = false;
    setRect(null);
    setTargetMessage(null);
    if (!step || !("targetId" in step)) return;
    const target = runtime.target(step.targetId);
    if (!target) {
      setTargetMessage("This feature is not available in the active profile. You can skip this step and return when its plugin is enabled.");
      return;
    }
    const update = () => {
      if (!lease) return;
      const next = lease.element.getBoundingClientRect();
      setRect({ top: next.top, left: next.left, right: next.right, bottom: next.bottom, width: next.width, height: next.height });
    };
    void target.reveal({}).then((nextLease) => {
      if (cancelled) {
        nextLease.dispose();
        return;
      }
      lease = nextLease;
      update();
      if (step.kind === "interaction" && lease.observe) {
        stopObservation = lease.observe(step.expectation, () => void runtime.completeCurrent());
      }
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
    }).catch((error) => {
      if (!cancelled) setTargetMessage(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      void stopObservation?.();
      lease?.dispose();
    };
  }, [active?.stepId, runtime, step]);

  if (!active || !journey || !stepSnapshot || !step) return null;
  const content = stepContent(step);
  const atStart = active.stepIndex === 0;
  const last = active.stepIndex === journey.totalSteps - 1;
  const action = step.kind === "action";
  const interaction = step.kind === "interaction";
  const check = step.kind === "check";
  const placement = "placement" in step && step.placement !== "auto"
    ? step.placement
    : undefined;
  const position = coachPosition(rect, coachSize, placement);

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" data-testid="onboarding-coach-mark">
      {rect ? (
        <>
          <div className="fixed inset-x-0 top-0 bg-black/55" style={{ height: Math.max(0, rect.top - 6) }} />
          <div className="fixed inset-x-0 bottom-0 bg-black/55" style={{ top: rect.bottom + 6 }} />
          <div className="fixed left-0 bg-black/55" style={{ top: rect.top - 6, width: Math.max(0, rect.left - 6), height: rect.height + 12 }} />
          <div className="fixed right-0 bg-black/55" style={{ top: rect.top - 6, left: rect.right + 6, height: rect.height + 12 }} />
          <div
            aria-hidden="true"
            className="fixed rounded-lg border-2 border-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_20%,transparent)] motion-safe:transition-[top,left,width,height] motion-safe:duration-200"
            style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55" />
      )}

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="onboarding-step-title"
        data-testid="onboarding-coach-dialog"
        className="pointer-events-auto fixed w-[min(400px,calc(100vw-40px))] overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[0_18px_55px_rgba(0,0,0,0.35)] motion-safe:transition-[top,left] motion-safe:duration-200"
        style={position}
      >
        <header className="flex items-start gap-3 border-b border-border px-4 py-3.5">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/12 text-primary">
            <HugeiconsIcon icon={Compass01Icon} size={15} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-muted-foreground">
              {journey.title} · {active.stepIndex + 1} of {journey.totalSteps}
            </div>
            <h2 id="onboarding-step-title" className="mt-0.5 text-sm font-semibold">{step.title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close onboarding"
            onClick={() => runtime.close()}
            className="termco-focus-ring flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.8} />
          </button>
        </header>

        <div className="space-y-3 px-4 py-4">
          <Content content={content} />
          {targetMessage ? <p role="status" className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{targetMessage}</p> : null}
          {active.message ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{active.message}</p> : null}
          {active.actionPreview ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs font-semibold">{active.actionPreview.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{active.actionPreview.explanation}</p>
              <code className="mt-2 block rounded bg-background px-2 py-1.5 text-[11px]">{active.actionPreview.operation}</code>
              <div className="mt-1 text-[11px] text-muted-foreground">Runs in {active.actionPreview.location}</div>
            </div>
          ) : null}
          {interaction ? (
            <p className="text-xs font-medium text-primary">Complete the highlighted interaction to continue.</p>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-border bg-muted/25 px-4 py-3">
          <button
            type="button"
            disabled={atStart || active.busy}
            onClick={() => runtime.back()}
            className="termco-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} size={13} strokeWidth={1.9} /> Back
          </button>
          {step.optional || targetMessage || interaction ? (
            <button
              type="button"
              disabled={active.busy}
              onClick={() => void runtime.skip()}
              className="termco-focus-ring h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Skip
            </button>
          ) : null}
          <div className="flex-1" />
          {!interaction ? (
            <button
              type="button"
              disabled={active.busy}
              onClick={() => void (active.actionPreview
                ? runtime.runPreparedAction()
                : action
                  ? runtime.prepareAction()
                  : check
                    ? runtime.retryCheck()
                    : runtime.next())}
              className="termco-focus-ring inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {active.busy ? "Working…" : active.actionPreview ? "Confirm and run" : action ? "Review action" : check ? "Check now" : last ? "Finish" : "Next"}
              {!active.busy && !action && !check ? <HugeiconsIcon icon={ArrowRight02Icon} size={13} strokeWidth={1.9} /> : null}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

const plugin: PluginModule = {
  inject: [
    ONBOARDING_RUNTIME_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
    UI_SETTINGS_VIEW_SERVICE,
    UI_COMMANDS_SERVICE,
    UI_OVERLAYS_SERVICE,
  ],
  async activate(context) {
    const runtime = context.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE);
    const settings = context.get<UiSettingsViewCapability>(UI_SETTINGS_VIEW_SERVICE);
    const owner = {
      pluginId: context.pluginId,
      generation: context.generation,
      key: "onboarding",
    };
    await context.effect(() =>
      context.get<UiSettingsSectionRegistry>(UI_SETTINGS_SECTIONS_SERVICE).register({
        id: "onboarding",
        label: "Getting started",
        description: "Guided, replayable journeys contributed by your active plugins.",
        category: "General",
        order: 5,
        icon: Compass01Icon,
        Component: () => <OnboardingSettings runtime={runtime} />,
        searchEntries: [
          {
            title: "Onboarding journeys",
            description: "Start, continue, replay, or reset guided product journeys.",
            keywords: "help learn tour walkthrough getting started profile plugin",
          },
        ],
      }, owner),
    );
    await context.effect(() =>
      context.get<UiOverlayRegistry>(UI_OVERLAYS_SERVICE).register({
        id: "onboarding-coach-mark",
        label: "Onboarding coach mark",
        description: "Spotlights semantic targets for the active onboarding step.",
        order: 95,
        Component: () => <OnboardingOverlay runtime={runtime} settings={settings} />,
      }, { ...owner, key: "onboarding-coach-mark" }),
    );
    await context.effect(() =>
      context.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register({
        id: "onboarding.open",
        title: "Open Getting Started",
        description: "Browse and replay onboarding journeys from active plugins.",
        group: "Help",
        keywords: ["help", "tour", "learn", "onboarding", "walkthrough"],
        icon: Compass01Icon,
        run: () => settings.show("onboarding"),
      }, { ...owner, key: "onboarding.open" }),
    );
  },
};

export default plugin;
