import type {
  ContributionOwner,
  ContributionRecord,
  Dispose,
  PluginActivationContext,
} from "@termco/kernel";

export const ONBOARDING_REGISTRY_SERVICE = "onboarding.registry" as const;
export const ONBOARDING_RUNTIME_SERVICE = "onboarding.runtime" as const;

export type OnboardingScope =
  | { kind: "user" }
  | { kind: "profile" }
  | { kind: "workspace" }
  | { kind: "rig" };

export interface OnboardingRichContent {
  markdown: string;
  media?: {
    kind: "image" | "animation" | "video";
    source: string;
    alt: string;
    captions?: string;
  };
}

export interface OnboardingStepBase {
  id: string;
  version: number;
  title: string;
  description?: string;
  optional?: boolean;
  scope: OnboardingScope;
}

export interface OnboardingInformationStep extends OnboardingStepBase {
  kind: "information";
  body: OnboardingRichContent;
}

export interface OnboardingTourStep extends OnboardingStepBase {
  kind: "tour";
  targetId: string;
  placement?: "auto" | "top" | "right" | "bottom" | "left";
  body: OnboardingRichContent;
}

export type OnboardingInteractionExpectation =
  | { kind: "click" }
  | { kind: "input"; completion: "non-empty" | "changed" }
  | { kind: "selection"; completion: "changed" }
  | { kind: "event"; name: string };

export interface OnboardingInteractionStep extends OnboardingStepBase {
  kind: "interaction";
  targetId: string;
  expectation: OnboardingInteractionExpectation;
  body: OnboardingRichContent;
}

export interface OnboardingNavigationStep extends OnboardingStepBase {
  kind: "navigation";
  targetId: string;
  body?: OnboardingRichContent;
}

export interface OnboardingCheckResult {
  satisfied: boolean;
  summary: string;
  detail?: string;
}

export interface OnboardingStepContext {
  profileId?: string;
  workspaceId?: string;
  rigId?: string;
}

export interface OnboardingCheckStep extends OnboardingStepBase {
  kind: "check";
  body: OnboardingRichContent;
  check(context: OnboardingStepContext): Promise<OnboardingCheckResult>;
}

export interface OnboardingActionPreview {
  token: string;
  title: string;
  explanation: string;
  operation: string;
  location: string;
}

export interface OnboardingActionResult {
  ok: boolean;
  summary: string;
  detail?: string;
}

export interface OnboardingActionStep extends OnboardingStepBase {
  kind: "action";
  body: OnboardingRichContent;
  prepare(context: OnboardingStepContext): Promise<OnboardingActionPreview>;
  run(
    context: OnboardingStepContext,
    confirmation: { token: string },
  ): Promise<OnboardingActionResult>;
}

export type OnboardingStep =
  | OnboardingInformationStep
  | OnboardingTourStep
  | OnboardingInteractionStep
  | OnboardingNavigationStep
  | OnboardingCheckStep
  | OnboardingActionStep;

export interface OnboardingJourney {
  id: string;
  title: string;
  description: string;
  order?: number;
  estimatedMinutes?: number;
  presentation?: OnboardingJourneyPresentation;
  profileIds?: readonly string[];
  steps: readonly OnboardingStep[];
}

export type OnboardingJourneyPresentation =
  | "automatic"
  | "contextual"
  | "available";

export interface OnboardingTargetLease {
  element: HTMLElement;
  observe?(
    expectation: OnboardingInteractionExpectation,
    satisfied: () => void,
  ): Dispose;
  dispose(): void;
}

export interface OnboardingTarget {
  id: string;
  label: string;
  reveal(context: OnboardingStepContext): Promise<OnboardingTargetLease>;
}

export interface OnboardingContribution {
  id: string;
  journeys?: readonly OnboardingJourney[];
  targets?: readonly OnboardingTarget[];
}

export interface OnboardingRegistry {
  register(
    contribution: OnboardingContribution,
    owner: ContributionOwner,
  ): Dispose;
  records(): readonly ContributionRecord<OnboardingContribution>[];
  subscribe(listener: () => void): Dispose;
}

export type OnboardingStepStatus = "available" | "complete" | "skipped";

export interface OnboardingStepSnapshot {
  id: string;
  title: string;
  optional: boolean;
  status: OnboardingStepStatus;
  step: OnboardingStep;
}

export interface OnboardingJourneySnapshot {
  id: string;
  title: string;
  description: string;
  estimatedMinutes?: number;
  presentation: OnboardingJourneyPresentation;
  owner: ContributionOwner;
  completedSteps: number;
  totalSteps: number;
  complete: boolean;
  steps: readonly OnboardingStepSnapshot[];
}

export interface ActiveOnboardingSnapshot {
  journeyId: string;
  stepIndex: number;
  stepId: string;
  busy: boolean;
  message?: string;
  actionPreview?: OnboardingActionPreview;
}

export interface OnboardingSnapshot {
  revision: number;
  journeys: readonly OnboardingJourneySnapshot[];
  active: ActiveOnboardingSnapshot | null;
  offer: {
    journeyId: string;
    title: string;
    description: string;
    presentation: OnboardingJourneyPresentation;
  } | null;
}

export interface OnboardingRuntime {
  snapshot(): OnboardingSnapshot;
  subscribe(listener: () => void): Dispose;
  setContext(context: OnboardingStepContext): void;
  /**
   * Ask the runtime to offer a journey at the point where its owning feature
   * becomes relevant. Completed and previously dismissed journeys stay quiet.
   */
  suggest(journeyId: string): Promise<boolean>;
  start(journeyId: string): Promise<void>;
  dismissOffer(): Promise<void>;
  next(): Promise<void>;
  back(): void;
  skip(): Promise<void>;
  close(): void;
  completeCurrent(): Promise<void>;
  retryCheck(): Promise<void>;
  prepareAction(): Promise<void>;
  runPreparedAction(): Promise<void>;
  resetJourney(journeyId: string): Promise<void>;
  resetAll(): Promise<void>;
  target(targetId: string): OnboardingTarget | undefined;
}

/**
 * Register plugin-owned onboarding without making the plugin depend on the
 * onboarding runtime. The feature remains active when onboarding is absent,
 * and the contribution is disposed with the owning plugin generation.
 */
export function contributeOnboarding(
  context: PluginActivationContext,
  contribution: OnboardingContribution,
  label = "Feature guidance",
): Dispose {
  return context.feature(
    {
      id: `onboarding:${contribution.id}`,
      label,
      requires: [ONBOARDING_REGISTRY_SERVICE],
      uiPolicy: "remove",
    },
    (scope) => scope.get<OnboardingRegistry>(ONBOARDING_REGISTRY_SERVICE).register(
      contribution,
      {
        pluginId: context.pluginId,
        generation: context.generation,
        key: contribution.id,
      },
    ),
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    queueMicrotask(resolve);
  });
}

export interface DomOnboardingTargetOptions {
  id: string;
  label: string;
  /** Make the owning feature visible before locating its target. */
  reveal?: (context: OnboardingStepContext) => void | Promise<void>;
  element: () => HTMLElement | null | undefined;
  unavailableMessage?: string;
  waitFrames?: number;
}

/** Build a semantic DOM target with standard interaction observation. */
export function domOnboardingTarget(
  options: DomOnboardingTargetOptions,
): OnboardingTarget {
  return {
    id: options.id,
    label: options.label,
    async reveal(context) {
      await options.reveal?.(context);
      let element: HTMLElement | null | undefined;
      const waitFrames = options.waitFrames ?? 24;
      for (let attempt = 0; attempt < waitFrames && !element; attempt += 1) {
        element = options.element();
        if (!element) await nextFrame();
      }
      if (!element) {
        throw new Error(
          options.unavailableMessage ?? `${options.label} is not available in the active profile.`,
        );
      }
      return {
        element,
        observe(expectation, satisfied) {
          const event = expectation.kind === "click"
            ? "click"
            : expectation.kind === "input"
            ? "input"
            : expectation.kind === "selection"
            ? "change"
            : expectation.name;
          const listener = () => satisfied();
          element.addEventListener(event, listener, { once: true });
          return () => element.removeEventListener(event, listener);
        },
        dispose() {},
      };
    },
  };
}

declare module "@termco/kernel" {
  interface Services {
    [ONBOARDING_REGISTRY_SERVICE]: OnboardingRegistry;
    [ONBOARDING_RUNTIME_SERVICE]: OnboardingRuntime;
  }
}
