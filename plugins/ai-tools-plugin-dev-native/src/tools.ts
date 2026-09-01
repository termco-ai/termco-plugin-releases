import type {
  AiToolContribution,
  AiToolDefinition,
  AiInteractiveToolDefinition,
  AiToolPresentationAdapter,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import type {
  PluginAuthoringProfileApi,
  PluginCatalogItem,
  PluginCreationTarget,
  PluginOnboardingPlan,
} from "@termco/profile-base";
import {
  UI_CONTRIBUTION_AUTHORING_DESCRIPTORS,
  type UiContributionEvidenceCapability,
  type UiContributionVerificationExpectation,
} from "@termco/ui-shell-base";
import type {
  UiChangeRevealCapability,
  UiChangeRevealMode,
} from "@termco/ui-change-reveal-base";
import type { OptionalCapability } from "@termco/kernel";
import type {
  OnboardingRegistry,
  OnboardingStep,
} from "@termco/onboarding-base";

type AppliedCompletion = {
  pluginId: string;
  generation: string;
  planId: string;
  verified?: Awaited<ReturnType<UiContributionEvidenceCapability["verify"]>>;
};

type OnboardingVerification = {
  ok: boolean;
  decision: PluginOnboardingPlan["decision"];
  journeyId?: string;
  message: string;
};

type PluginAuthoringIntent = "create" | "fork" | "replace";
type PluginRevealPolicy = "auto" | "offer" | "none";

const VERIFIABLE_SEMANTIC_ROLES = [
  "alert",
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "heading",
  "link",
  "listbox",
  "menuitem",
  "option",
  "progressbar",
  "radio",
  "status",
  "switch",
  "tab",
  "textbox",
] as const;

type PluginAuthoringPlan = {
  planId: string;
  intent: PluginAuthoringIntent;
  plugin: {
    id: string;
    name: string;
    description: string;
    category: string;
  };
  sourcePluginId?: string;
  target: PluginCreationTarget;
  variant?: string;
  contributions: readonly UiContributionVerificationExpectation[];
  reveal: PluginRevealPolicy;
  onboarding: PluginOnboardingPlan;
};

type PluginBriefInput = {
  revision: number;
  title: string;
  outcome: string;
  userJourney: string;
  experience: {
    location: string;
    interaction: string;
    states: readonly string[];
  };
  scope: {
    included: readonly string[];
    excluded: readonly string[];
  };
  acceptanceCriteria: readonly string[];
  onboarding?: PluginOnboardingPlan;
  authoring: Omit<PluginAuthoringPlan, "planId" | "onboarding">;
};

type PluginBriefOutput = {
  action: "confirm" | "revise" | "continue-interview" | "cancel";
  note?: string;
};

type PluginDevelopmentState = {
  completions: Map<string, AppliedCompletion>;
  plans: Map<string, PluginAuthoringPlan>;
  draftPlanByPlugin: Map<string, string>;
  planByBriefCallId: Map<string, string>;
};

type PluginDevelopmentToolName =
  | "plugin_catalog"
  | "plugin_capabilities"
  | "plugin_plan"
  | "plugin_verify"
  | "plugin_reveal_change"
  | "plugin_open_folder"
  | "plugin_source_list"
  | "plugin_source_read"
  | "plugin_create"
  | "plugin_fork"
  | "plugin_copy_and_replace"
  | "plugin_source_write"
  | "plugin_apply"
  | "plugin_undo"
  | "plugin_activation_preview"
  | "plugin_set_enabled";

export type PluginDevelopmentTools = Record<
  PluginDevelopmentToolName,
  AiToolDefinition
> & { plugin_brief: AiInteractiveToolDefinition };

type PluginCompletionAction =
  | "show-again"
  | "open-folder"
  | "disable"
  | "undo";

type PluginCompletionRecord = {
  kind: "plugin-completion";
  status: "verified";
  completionId: string;
  planId: string;
  plugin: {
    id: string;
    name: string;
    intent: PluginAuthoringIntent;
    target: PluginCreationTarget;
    generation: string;
    sourcePluginId?: string;
  };
  contributions: Awaited<ReturnType<UiContributionEvidenceCapability["verify"]>>["refs"];
  stages: Awaited<ReturnType<UiContributionEvidenceCapability["verify"]>>["completedStages"];
  onboarding: OnboardingVerification;
  actions: readonly PluginCompletionAction[];
  ok: true;
  generation: string;
  message: string;
};

function completionRecord(value: unknown): PluginCompletionRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PluginCompletionRecord>;
  return candidate.kind === "plugin-completion" &&
      candidate.status === "verified" &&
      typeof candidate.completionId === "string" &&
      candidate.plugin?.id &&
      Array.isArray(candidate.contributions) &&
      Array.isArray(candidate.stages) &&
      Array.isArray(candidate.actions)
    ? candidate as PluginCompletionRecord
    : null;
}

function createCompletionPresentation(
  profile: PluginAuthoringProfileApi,
  changeReveal: UiChangeRevealCapability,
): AiToolPresentationAdapter {
  return {
    renderer: "plugin-completion",
    interactive: false,
    parseInput: (input) => input && typeof input === "object" ? input : null,
    parseOutput: completionRecord,
    async performAction(request) {
      const record = completionRecord(request.output);
      if (!record) throw new Error("plugin completion output is invalid");
      switch (request.action) {
        case "show-again":
          if (!record.actions.includes("show-again")) {
            throw new Error("this plugin completion has no visible change to reveal");
          }
          return Promise.all(record.contributions.map((target) =>
            changeReveal.reveal({
              target,
              mode: "show-and-spotlight",
              announcement: `${record.plugin.name} is ready.`,
            })
          ));
        case "open-folder":
          return profile.openPluginFolder(record.plugin.id);
        case "disable-preview":
          return profile.previewSetEnabled(record.plugin.id, false);
        case "disable": {
          const confirmation = request.payload as {
            previewId?: string;
            generation?: number;
          } | undefined;
          if (
            !confirmation?.previewId ||
            typeof confirmation.generation !== "number"
          ) {
            throw new Error("disable requires a still-current impact preview");
          }
          return profile.setEnabled(record.plugin.id, false, {
            previewId: confirmation.previewId,
            generation: confirmation.generation,
          });
        }
        case "undo":
          return profile.undo(record.completionId);
        default:
          throw new Error(`unknown plugin completion action "${request.action}"`);
      }
    },
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parsePluginBriefInput(value: unknown): PluginBriefInput | null {
  const raw = record(value);
  const experience = record(raw?.experience);
  const scope = record(raw?.scope);
  const authoring = record(raw?.authoring);
  if (
    !raw || !experience || !scope || !authoring ||
    typeof raw.revision !== "number" ||
    typeof raw.title !== "string" ||
    typeof raw.outcome !== "string" ||
    typeof raw.userJourney !== "string" ||
    typeof experience.location !== "string" ||
    typeof experience.interaction !== "string" ||
    !Array.isArray(experience.states) ||
    !Array.isArray(scope.included) ||
    !Array.isArray(scope.excluded) ||
    !Array.isArray(raw.acceptanceCriteria)
  ) return null;
  return raw as unknown as PluginBriefInput;
}

function onboardingPlan(value: unknown): PluginOnboardingPlan | null {
  const raw = record(value);
  if (!raw || typeof raw.rationale !== "string") return null;
  if (raw.decision === "omit" || raw.decision === "not-applicable") {
    return raw as unknown as PluginOnboardingPlan;
  }
  const journey = record(raw.journey);
  if (
    raw.decision !== "include" || !journey ||
    typeof journey.id !== "string" ||
    typeof journey.title !== "string" ||
    typeof journey.description !== "string" ||
    !["contextual", "available"].includes(String(journey.presentation)) ||
    !Array.isArray(journey.steps) || journey.steps.length === 0
  ) return null;
  for (const value of journey.steps) {
    const step = record(value);
    if (
      !step || typeof step.id !== "string" ||
      typeof step.version !== "number" || step.version < 1 ||
      typeof step.title !== "string" ||
      typeof step.instruction !== "string" ||
      !["information", "tour", "interaction", "navigation", "check", "action"]
        .includes(String(step.kind))
    ) return null;
    const needsTarget = ["tour", "interaction", "navigation"].includes(String(step.kind));
    if (needsTarget && typeof step.targetId !== "string") return null;
    if (step.kind === "interaction" && !record(step.expectation)) return null;
  }
  return raw as unknown as PluginOnboardingPlan;
}

function onboardingStepInstruction(step: OnboardingStep): string | undefined {
  return "body" in step ? step.body?.markdown : undefined;
}

function verifyOnboarding(
  plan: PluginOnboardingPlan,
  pluginId: string,
  generation: string,
  observed?: OptionalCapability<OnboardingRegistry>,
): OnboardingVerification {
  const registry = observed?.current();
  if (!registry) {
    return plan.decision === "include"
      ? {
          ok: false,
          decision: plan.decision,
          message: "Onboarding was included in the plan, but the onboarding registry is unavailable.",
        }
      : {
          ok: true,
          decision: plan.decision,
          message: `Onboarding ${plan.decision} as planned.`,
        };
  }
  const owned = registry.records().filter(
    (entry) => entry.pluginId === pluginId && entry.generation === generation,
  );
  const journeys = owned.flatMap((entry) => entry.value.journeys ?? []);
  if (plan.decision !== "include") {
    return journeys.length === 0
      ? {
          ok: true,
          decision: plan.decision,
          message: `Onboarding ${plan.decision} as planned.`,
        }
      : {
          ok: false,
          decision: plan.decision,
          message: `Plugin registered onboarding journey "${journeys[0]?.id}" although the confirmed decision was ${plan.decision}.`,
        };
  }
  const expected = plan.journey;
  const actual = journeys.find((journey) => journey.id === expected.id);
  if (!actual) {
    return {
      ok: false,
      decision: plan.decision,
      journeyId: expected.id,
      message: `Planned onboarding journey "${expected.id}" is not registered by the live plugin generation.`,
    };
  }
  if (
    actual.title !== expected.title ||
    actual.description !== expected.description ||
    actual.presentation !== expected.presentation ||
    actual.steps.length !== expected.steps.length
  ) {
    return {
      ok: false,
      decision: plan.decision,
      journeyId: expected.id,
      message: `Onboarding journey "${expected.id}" does not match the confirmed title, description, presentation, or step count.`,
    };
  }
  const targetIds = new Set(
    owned.flatMap((entry) => entry.value.targets?.map((target) => target.id) ?? []),
  );
  for (let index = 0; index < expected.steps.length; index += 1) {
    const plannedStep = expected.steps[index];
    const liveStep = actual.steps[index];
    if (
      !liveStep ||
      liveStep.id !== plannedStep.id ||
      liveStep.version !== plannedStep.version ||
      liveStep.title !== plannedStep.title ||
      liveStep.kind !== plannedStep.kind ||
      onboardingStepInstruction(liveStep) !== plannedStep.instruction ||
      ("targetId" in liveStep ? liveStep.targetId : undefined) !== plannedStep.targetId ||
      JSON.stringify("expectation" in liveStep ? liveStep.expectation : undefined) !==
        JSON.stringify(plannedStep.expectation)
    ) {
      return {
        ok: false,
        decision: plan.decision,
        journeyId: expected.id,
        message: `Onboarding step ${index + 1} does not match the confirmed contract for "${plannedStep.id}".`,
      };
    }
    if (plannedStep.targetId && !targetIds.has(plannedStep.targetId)) {
      return {
        ok: false,
        decision: plan.decision,
        journeyId: expected.id,
        message: `Onboarding target "${plannedStep.targetId}" is not owned by the live plugin generation.`,
      };
    }
  }
  return {
    ok: true,
    decision: plan.decision,
    journeyId: expected.id,
    message: `Onboarding journey "${expected.title}" is registered with ${expected.steps.length} verified step${expected.steps.length === 1 ? "" : "s"}.`,
  };
}

function parsePluginBriefOutput(value: unknown): PluginBriefOutput | null {
  const raw = record(value);
  if (
    !raw ||
    !["confirm", "revise", "continue-interview", "cancel"].includes(
      String(raw.action),
    )
  ) return null;
  if (raw.note !== undefined && typeof raw.note !== "string") return null;
  return raw as unknown as PluginBriefOutput;
}

const pluginBriefPresentation: AiToolPresentationAdapter = {
  renderer: "plugin-brief",
  interactive: true,
  parseInput: parsePluginBriefInput,
  parseOutput: parsePluginBriefOutput,
};

type AuthoringCatalogItem = PluginCatalogItem & {
  forkedFrom?: string;
  profileRelation?: "inherited" | "installed" | "fork" | "replacement";
};

const pluginId = { type: "string", minLength: 3, maxLength: 80 };
const relativePath = { type: "string", minLength: 1, maxLength: 500 };
const authoringTargets: readonly PluginCreationTarget[] = [
  ...UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.map((descriptor) => descriptor.service),
  "renderer-provider",
  "main-provider",
  "server",
];
const authoringVariants = [...new Set(
  UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.flatMap(
    (descriptor) => "variants" in descriptor ? descriptor.variants : [],
  ),
)];

function planForIntent(
  state: PluginDevelopmentState,
  input: unknown,
  intent: PluginAuthoringIntent,
): PluginAuthoringPlan {
  const planId = (input as { planId?: string }).planId;
  const plan = planId ? state.plans.get(planId) : undefined;
  if (!plan) {
    throw new Error(`unknown plugin plan "${planId ?? ""}"; call plugin_plan first`);
  }
  if (plan.intent !== intent) {
    throw new Error(`plugin plan "${planId}" is ${plan.intent}, not ${intent}`);
  }
  return plan;
}

function isUiContributionTarget(
  target: PluginCreationTarget,
): target is UiContributionVerificationExpectation["contribution"]["service"] {
  return UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.some(
    (descriptor) => descriptor.service === target,
  );
}

async function createAuthoringPlan(
  profile: PluginAuthoringProfileApi,
  state: PluginDevelopmentState,
  input: unknown,
): Promise<PluginAuthoringPlan & { impact: Record<string, unknown> }> {
  const values = input as Omit<PluginAuthoringPlan, "planId">;
  const resolvedOnboarding = onboardingPlan(values.onboarding);
  if (!resolvedOnboarding) {
    throw new Error("plugin authoring requires a valid onboarding decision");
  }
  if (!authoringTargets.includes(values.target)) {
    throw new Error(`unknown plugin authoring target "${values.target}"`);
  }
  const source = values.sourcePluginId;
  if (values.intent === "create" && source) {
    throw new Error("a create plan cannot select a source plugin");
  }
  if (values.intent !== "create" && !source) {
    throw new Error(`a ${values.intent} plan requires sourcePluginId`);
  }
  if (source === values.plugin.id) {
    throw new Error("the new plugin id must differ from its source plugin id");
  }
  if (profile.catalog().some((entry) => entry.id === values.plugin.id)) {
    throw new Error(`plugin id "${values.plugin.id}" is already selected by the profile`);
  }
  if (source && !profile.catalog().some((entry) => entry.id === source)) {
    throw new Error(`source plugin "${source}" is not selected by the current profile`);
  }

  const descriptor = UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.find(
    (entry) => entry.service === values.target,
  );
  const variants = descriptor && "variants" in descriptor
    ? descriptor.variants
    : undefined;
  if (values.variant && !variants?.includes(values.variant as never)) {
    throw new Error(
      `variant "${values.variant}" is not declared by target "${values.target}"`,
    );
  }
  if (descriptor?.reveal === "none" && values.reveal !== "none") {
    throw new Error(
      `target "${values.target}" has no visible surface; reveal must be "none"`,
    );
  }
  if (isUiContributionTarget(values.target)) {
    if (values.contributions.length === 0) {
      throw new Error(`UI target "${values.target}" requires a planned contribution proof`);
    }
    for (const expectation of values.contributions) {
      if (expectation.contribution.service !== values.target) {
        throw new Error(
          `planned contribution service "${expectation.contribution.service}" does not match target "${values.target}"`,
        );
      }
    }
  } else if (values.contributions.length > 0) {
    throw new Error(`non-UI target "${values.target}" cannot declare UI contribution proofs`);
  }

  const registered = await profile.plan({
    ...values,
    contributions: structuredClone(values.contributions),
    onboarding: structuredClone(resolvedOnboarding),
  });
  const plan: PluginAuthoringPlan = {
    ...registered,
    onboarding: structuredClone(resolvedOnboarding),
  };
  state.plans.set(plan.planId, plan);
  return {
    ...plan,
    impact: {
      profileChangesBeforeApply: 0,
      sourcePluginChanged: false,
      replacementAtApply: values.intent === "replace" ? source : null,
      independentlySelectable: values.intent !== "replace",
      verificationProofs: plan.contributions.length,
      onboardingDecision: plan.onboarding.decision,
    },
  };
}

async function createAuthoringPlanFromBrief(
  profile: PluginAuthoringProfileApi,
  state: PluginDevelopmentState,
  runtime: AiToolRuntime,
): Promise<PluginAuthoringPlan & {
  briefCallId: string;
  impact: Record<string, unknown>;
}> {
  if (!runtime.getLatestCompletedToolCall) {
    throw new Error("this AI session cannot validate a Plugin Brief");
  }
  const completed = await runtime.getLatestCompletedToolCall("plugin_brief");
  if (!completed) {
    throw new Error(
      "the latest Plugin Brief is missing; present it and wait for confirmation",
    );
  }
  const briefCallId = completed.callId;
  const brief = parsePluginBriefInput(completed.input);
  const response = parsePluginBriefOutput(completed.output);
  if (!brief || response?.action !== "confirm") {
    throw new Error(
      `Plugin Brief "${briefCallId}" was not confirmed; revise, continue interviewing, or cancel as requested`,
    );
  }
  const resolvedOnboarding = onboardingPlan(brief.onboarding);
  if (!resolvedOnboarding) {
    throw new Error(
      `Plugin Brief "${briefCallId}" has no valid onboarding decision; present a new revision and confirm it before planning`,
    );
  }
  const existingPlanId = state.planByBriefCallId.get(briefCallId);
  if (existingPlanId) {
    const existing = state.plans.get(existingPlanId);
    if (existing) {
      return {
        ...existing,
        briefCallId,
        impact: {
          profileChangesBeforeApply: 0,
          sourcePluginChanged: false,
          replacementAtApply:
            existing.intent === "replace" ? existing.sourcePluginId ?? null : null,
          independentlySelectable: existing.intent !== "replace",
          verificationProofs: existing.contributions.length,
          onboardingDecision: existing.onboarding.decision,
        },
      };
    }
  }
  const planned = await createAuthoringPlan(profile, state, {
    ...brief.authoring,
    onboarding: resolvedOnboarding,
  });
  state.planByBriefCallId.set(briefCallId, planned.planId);
  return { ...planned, briefCallId };
}
function searchAuthoringCapabilities(query = "", exactId?: string) {
  if (exactId) {
    return UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.filter(
      (capability) => capability.service === exactId,
    );
  }
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.filter((capability) => {
    const text = Object.values(capability).join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function contributionProofSchema(): Record<string, unknown> {
  return objectSchema({
    contribution: objectSchema({
      service: {
        type: "string",
        enum: UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.map(
          (descriptor) => descriptor.service,
        ),
      },
      key: { type: "string", minLength: 1, maxLength: 200 },
    }, ["service", "key"]),
    present: { type: "boolean", const: true },
    visibleTarget: objectSchema({
      role: { type: "string", enum: VERIFIABLE_SEMANTIC_ROLES },
      name: { type: "string", minLength: 1, maxLength: 200 },
    }, ["role", "name"]),
    actions: {
      type: "array",
      maxItems: 5,
      description:
        "Ordered safe interactions. Activate a sidebar rail target before clicking a control inside its mounted view.",
      items: {
        oneOf: [
          objectSchema({ kind: { type: "string", const: "activate" } }, ["kind"]),
          objectSchema({
            kind: { type: "string", const: "click" },
            target: objectSchema({
              role: { type: "string", enum: VERIFIABLE_SEMANTIC_ROLES },
              name: { type: "string", minLength: 1, maxLength: 200 },
            }, ["role", "name"]),
          }, ["kind", "target"]),
        ],
      },
    },
    after: {
      type: "array",
      maxItems: 20,
      description:
        "Final postconditions after every action. Include only simultaneously true final state, use real accessible roles, and never invent role text.",
      items: {
        oneOf: [
          objectSchema({
            selectedContribution: { type: "string", minLength: 1, maxLength: 200 },
          }, ["selectedContribution"]),
          objectSchema({
            role: { type: "string", enum: VERIFIABLE_SEMANTIC_ROLES },
            name: { type: "string", minLength: 1, maxLength: 200 },
            visible: { type: "boolean", const: true },
          }, ["role", "name", "visible"]),
        ],
      },
    },
  }, ["contribution", "present"]);
}

function authoringRequestSchema(): Record<string, unknown> {
  return objectSchema({
    intent: { type: "string", enum: ["create", "fork", "replace"] },
    plugin: objectSchema({
      id: pluginId,
      name: { type: "string", minLength: 1, maxLength: 120 },
      description: { type: "string", minLength: 1, maxLength: 500 },
      category: { type: "string", minLength: 1, maxLength: 100 },
    }, ["id", "name", "description", "category"]),
    sourcePluginId: pluginId,
    target: { type: "string", enum: authoringTargets },
    variant: {
      type: "string",
      enum: authoringVariants,
      description:
        "Optional generated capability variant. Omit it unless plugin_capabilities lists the exact value for the selected target.",
    },
    contributions: {
      type: "array",
      maxItems: 20,
      items: contributionProofSchema(),
    },
    reveal: { type: "string", enum: ["auto", "offer", "none"] },
  }, ["intent", "plugin", "target", "contributions", "reveal"]);
}

function stringList(maxItems: number): Record<string, unknown> {
  return {
    type: "array",
    maxItems,
    items: { type: "string", minLength: 1, maxLength: 500 },
  };
}

function onboardingPlanSchema(): Record<string, unknown> {
  const rationale = { type: "string", minLength: 1, maxLength: 500 };
  const step = objectSchema({
    id: { type: "string", minLength: 1, maxLength: 120 },
    version: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 160 },
    kind: {
      type: "string",
      enum: ["information", "tour", "interaction", "navigation", "check", "action"],
    },
    instruction: { type: "string", minLength: 1, maxLength: 800 },
    targetId: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      description: "Required for tour, interaction, and navigation steps; must be owned by this plugin's onboarding contribution.",
    },
    expectation: {
      oneOf: [
        objectSchema({ kind: { type: "string", const: "click" } }, ["kind"]),
        objectSchema({
          kind: { type: "string", const: "input" },
          completion: { type: "string", enum: ["non-empty", "changed"] },
        }, ["kind", "completion"]),
        objectSchema({
          kind: { type: "string", const: "selection" },
          completion: { type: "string", const: "changed" },
        }, ["kind", "completion"]),
        objectSchema({
          kind: { type: "string", const: "event" },
          name: { type: "string", minLength: 1, maxLength: 160 },
        }, ["kind", "name"]),
      ],
    },
  }, ["id", "version", "title", "kind", "instruction"]);
  return {
    oneOf: [
      objectSchema({
        decision: { type: "string", const: "include" },
        rationale,
        journey: objectSchema({
          id: { type: "string", minLength: 1, maxLength: 120 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          description: { type: "string", minLength: 1, maxLength: 500 },
          presentation: { type: "string", enum: ["contextual", "available"] },
          steps: { type: "array", minItems: 1, maxItems: 8, items: step },
        }, ["id", "title", "description", "presentation", "steps"]),
      }, ["decision", "rationale", "journey"]),
      objectSchema({
        decision: { type: "string", const: "omit" },
        rationale,
      }, ["decision", "rationale"]),
      objectSchema({
        decision: { type: "string", const: "not-applicable" },
        rationale,
      }, ["decision", "rationale"]),
    ],
  };
}

function pluginBriefInputSchema(): Record<string, unknown> {
  return objectSchema({
    revision: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 120 },
    outcome: { type: "string", minLength: 1, maxLength: 800 },
    userJourney: { type: "string", minLength: 1, maxLength: 1_200 },
    experience: objectSchema({
      location: { type: "string", minLength: 1, maxLength: 300 },
      interaction: { type: "string", minLength: 1, maxLength: 800 },
      states: stringList(12),
    }, ["location", "interaction", "states"]),
    scope: objectSchema({
      included: stringList(20),
      excluded: stringList(20),
    }, ["included", "excluded"]),
    acceptanceCriteria: stringList(20),
    onboarding: onboardingPlanSchema(),
    authoring: authoringRequestSchema(),
  }, [
    "revision",
    "title",
    "outcome",
    "userJourney",
    "experience",
    "scope",
    "acceptanceCriteria",
    "onboarding",
    "authoring",
  ]);
}

function searchableText(plugin: AuthoringCatalogItem): string {
  return [
    plugin.id,
    plugin.name,
    plugin.description,
    plugin.category,
    plugin.sourceFolder,
    plugin.whyLoaded,
    plugin.forkedFrom ?? "",
    plugin.replaces ?? "",
    plugin.status ?? "",
    plugin.profileRelation ?? "",
    ...plugin.permissions,
    ...plugin.provides.flatMap((entry) => [entry.id, entry.key ?? "", entry.description]),
    ...plugin.consumes.flatMap((entry) => [entry.id, entry.description, ...entry.providers]),
  ].join(" ").toLocaleLowerCase();
}

function sourcePathStem(path: string): string {
  return path.replace(/\.[^./]+$/, "");
}

function sourcePathSuggestions(
  files: readonly string[],
  requestedPath: string,
): readonly string[] {
  const requestedStem = sourcePathStem(requestedPath);
  const directory = requestedPath.includes("/")
    ? requestedPath.slice(0, requestedPath.lastIndexOf("/") + 1)
    : "";
  return [...files]
    .sort((left, right) => {
      const leftRank = sourcePathStem(left) === requestedStem
        ? 0
        : left.startsWith(directory)
          ? 1
          : 2;
      const rightRank = sourcePathStem(right) === requestedStem
        ? 0
        : right.startsWith(directory)
          ? 1
          : 2;
      return leftRank - rightRank || left.localeCompare(right);
    })
    .slice(0, 5);
}

export function searchCatalog(
  catalog: readonly AuthoringCatalogItem[],
  query = "",
  category?: string,
): readonly AuthoringCatalogItem[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog.filter((plugin) =>
    (!category || plugin.category === category) &&
    words.every((word) => searchableText(plugin).includes(word))
  );
}

export function createPluginDevelopmentTools(
  profile: PluginAuthoringProfileApi,
  evidence: UiContributionEvidenceCapability,
  changeReveal: UiChangeRevealCapability,
  state: PluginDevelopmentState = {
    completions: new Map(),
    plans: new Map(),
    draftPlanByPlugin: new Map(),
    planByBriefCallId: new Map(),
  },
  runtime: AiToolRuntime = {},
  onboarding?: OptionalCapability<OnboardingRegistry>,
): PluginDevelopmentTools {
  return {
    plugin_catalog: {
      description:
        "Search every plugin selected by the current profile, including active, reduced, blocked, failed, and disabled rows. Results explain status, services, replacement relationships, selection reason, permissions, source folder, and editability. Use this to inspect integrations or to choose an active source only when the user explicitly asks to replace it.",
      inputSchema: objectSchema({
        query: { type: "string", maxLength: 200 },
        category: { type: "string", maxLength: 100 },
      }),
      execute: (input) => {
        const values = input as { query?: string; category?: string };
        const matches = searchCatalog(profile.catalog(), values.query, values.category);
        return { count: matches.length, plugins: matches };
      },
    },
    plugin_capabilities: {
      description:
        "Discover contribution services by product intent, then inspect the exact service before mutation. A broad query returns compact matching contracts; exactId returns the complete required fields, variants, collision policy, verification postcondition, reveal strategy, owning package, types, lifecycle usage, and selected providers.",
      inputSchema: objectSchema({
        query: { type: "string", maxLength: 200 },
        exactId: { type: "string", maxLength: 200 },
      }),
      execute: (input) => {
        const { query, exactId } = input as { query?: string; exactId?: string };
        const capabilities = searchAuthoringCapabilities(query, exactId).map((capability) => ({
          ...capability,
          selectedProviders: profile.catalog()
            .filter((plugin) => plugin.provides.some((entry) => entry.id === capability.service))
            .map((plugin) => ({ id: plugin.id, status: plugin.status ?? "active" })),
        }));
        return {
          mode: exactId ? "exact" : "broad",
          ...(exactId && capabilities.length === 0
            ? { error: `unknown UI contribution service "${exactId}"` }
            : {}),
          capabilities,
          manifest: {
            schemaVersion: 3,
            entrypoints: ["renderer", "main", "utility"],
            assetBuilds: "Compile a plugin-owned source entry to an assets/*.mjs output with node or browser platform.",
            dependencies: "Declare every imported contract and third-party package in both termco-plugin.json and package.json.",
          },
          lifecycle: "Declare every direct service read in inject and own every registration/resource through context.effect cleanup.",
        };
      },
    },
    plugin_brief: {
      description:
        "Present the complete shared understanding before plugin planning. Inspect product facts first, ask only unresolved user decisions with ask_user, then include the outcome, journey, experience, scope, acceptance criteria, explicit onboarding decision, and exact resolved authoring request. User-facing Create/Fork/Replace work recommends include; internal providers use not-applicable. This pauses until the user confirms, requests a revision, asks for more questions, or cancels.",
      inputSchema: pluginBriefInputSchema(),
    },
    plugin_plan: {
      description:
        "Create one immutable technical plugin plan from this session's latest confirmed Plugin Brief. The platform resolves the durable brief internally; revised, cancelled, cross-session, and missing briefs are rejected. This performs no write and no profile mutation.",
      inputSchema: objectSchema({}),
      execute: () => createAuthoringPlanFromBrief(profile, state, runtime),
    },
    plugin_verify: {
      description:
        "Verify the final live plugin generation against the semantic proofs frozen by plugin_plan. Input only the completion id from plugin_apply; plugin id, generation, services, keys, accessible targets, actions, and postconditions cannot be weakened after apply. Another plugin's similarly named control cannot satisfy it.",
      inputSchema: objectSchema({
        completionId: { type: "string", minLength: 1, maxLength: 200 },
      }, ["completionId"]),
      async execute(input) {
        const values = input as { completionId: string };
        const completion = state.completions.get(values.completionId);
        if (!completion) {
          throw new Error(
            `unknown plugin completion "${values.completionId}"; call plugin_apply first`,
          );
        }
        const plan = state.plans.get(completion.planId);
        if (!plan) {
          throw new Error(`plugin plan "${completion.planId}" no longer exists`);
        }
        const report = await evidence.verify({
          pluginId: completion.pluginId,
          generation: completion.generation,
          expectations: plan.contributions,
        });
        if (!report.ok) return { completionId: values.completionId, ...report };
        const onboardingReport = verifyOnboarding(
          plan.onboarding,
          completion.pluginId,
          completion.generation,
          onboarding,
        );
        if (!onboardingReport.ok) {
          return {
            completionId: values.completionId,
            ...onboardingReport,
          };
        }
        completion.verified = report;
        const revealDescriptor = UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.find(
          (descriptor) => descriptor.service === plan.target,
        );
        const actions: PluginCompletionAction[] = [
          ...(plan.reveal !== "none" &&
              revealDescriptor?.reveal !== "none" &&
              report.refs.length > 0
            ? ["show-again" as const]
            : []),
          "open-folder",
          "disable",
          "undo",
        ];
        const record: PluginCompletionRecord = {
          kind: "plugin-completion",
          status: "verified",
          completionId: values.completionId,
          planId: plan.planId,
          plugin: {
            id: plan.plugin.id,
            name: plan.plugin.name,
            intent: plan.intent,
            target: plan.target,
            generation: completion.generation,
            ...(plan.sourcePluginId
              ? { sourcePluginId: plan.sourcePluginId }
              : {}),
          },
          contributions: report.refs,
          stages: report.completedStages,
          actions,
          ok: true,
          generation: completion.generation,
          message: report.message,
          onboarding: onboardingReport,
        };
        return record;
      },
    },
    plugin_reveal_change: {
      description:
        "Reveal one or all exact contribution refs from a semantically verified plugin completion. This rejects unknown, failed, stale, or unverified applies. Surface owners decide how to show the location; commands are never executed and destructive UI is never clicked.",
      inputSchema: objectSchema({
        completionId: { type: "string", minLength: 1, maxLength: 200 },
        service: {
          type: "string",
          enum: UI_CONTRIBUTION_AUTHORING_DESCRIPTORS.map(
            (descriptor) => descriptor.service,
          ),
        },
        key: { type: "string", minLength: 1, maxLength: 200 },
        mode: {
          type: "string",
          enum: ["spotlight", "show", "show-and-spotlight"],
        },
        announcement: { type: "string", minLength: 1, maxLength: 300 },
      }, ["completionId", "mode", "announcement"]),
      async execute(input) {
        const values = input as {
          completionId: string;
          service?: string;
          key?: string;
          mode: UiChangeRevealMode;
          announcement: string;
        };
        const completion = state.completions.get(values.completionId);
        if (!completion?.verified?.ok) {
          throw new Error(
            `plugin completion "${values.completionId}" has not passed semantic verification`,
          );
        }
        const refs = completion.verified.refs.filter((ref) =>
          (!values.service || ref.service === values.service) &&
          (!values.key || ref.key === values.key)
        );
        if (refs.length === 0) {
          throw new Error(
            `verified completion "${values.completionId}" has no matching contribution ref`,
          );
        }
        const results = await Promise.all(refs.map((target) =>
          changeReveal.reveal({
            target,
            mode: values.mode,
            announcement: values.announcement,
          })
        ));
        return {
          completionId: values.completionId,
          pluginId: completion.pluginId,
          generation: completion.generation,
          results,
        };
      },
    },
    plugin_open_folder: {
      description:
        "Reveal the exact selected plugin or managed draft source directory in the operating-system file manager. This never falls back to the shared plugin root.",
      inputSchema: objectSchema({ pluginId }, ["pluginId"]),
      needsApproval: true,
      execute: (input) => profile.openPluginFolder(
        (input as { pluginId: string }).pluginId,
      ),
    },
    plugin_source_list: {
      description:
        "List every source file in a managed draft or selected plugin's whole folder. Generated caches, dependencies, and symlinks are excluded.",
      inputSchema: objectSchema({ pluginId }, ["pluginId"]),
      execute: async (input) => {
        const { pluginId: id } = input as { pluginId: string };
        return { pluginId: id, files: await profile.listSourceFiles(id) };
      },
    },
    plugin_source_read: {
      description:
        "Read one UTF-8 file from a managed draft or selected plugin source folder. Use an exact path returned by plugin_source_list; paths are jailed to that plugin and cannot follow symlinks.",
      inputSchema: objectSchema({ pluginId, relativePath }, ["pluginId", "relativePath"]),
      execute: async (input) => {
        const values = input as { pluginId: string; relativePath: string };
        const files = await profile.listSourceFiles(values.pluginId);
        if (!files.includes(values.relativePath)) {
          const suggestions = sourcePathSuggestions(files, values.relativePath);
          throw new Error(
            `source file "${values.relativePath}" does not exist in plugin "${values.pluginId}"; ` +
              (suggestions.length > 0
                ? `use one of: ${suggestions.join(", ")}`
                : "plugin_source_list returned no readable source files"),
          );
        }
        return {
          pluginId: values.pluginId,
          relativePath: values.relativePath,
          content: await profile.readSourceFile(values.pluginId, values.relativePath),
        };
      },
    },
    plugin_create: {
      description:
        "Create and compile the independent draft described by an existing create plan. It never accepts ad-hoc identity, target, source, or proof fields and never changes the active profile.",
      inputSchema: objectSchema({
        planId: { type: "string", minLength: 1, maxLength: 200 },
      }, ["planId"]),
      needsApproval: true,
      async execute(input) {
        const plan = planForIntent(state, input, "create");
        const result = await profile.create(plan.planId);
        if (result.status === "draft") {
          state.draftPlanByPlugin.set(result.pluginId, plan.planId);
        }
        return result;
      },
    },
    plugin_fork: {
      description:
        "Copy a selected plugin into a new independent managed draft and compile it in isolation. The manifest records forkedFrom but never replaces or disables the source. Use only when the user explicitly asks for an independent derivative; change conflicting service ids and contribution keys before plugin_apply.",
      inputSchema: objectSchema({
        planId: { type: "string", minLength: 1, maxLength: 200 },
      }, ["planId"]),
      needsApproval: true,
      async execute(input) {
        const plan = planForIntent(state, input, "fork");
        const result = await profile.fork(plan.planId);
        if (result.status === "forked") {
          state.draftPlanByPlugin.set(result.pluginId, plan.planId);
        }
        return result;
      },
    },
    plugin_copy_and_replace: {
      description:
        "Prepare an intentional replacement draft from one active plugin: copy its complete source folder, assign a new id and manifest replaces claim, and compile without changing the live profile. Use only when the user wants to alter or substitute that feature. Edit the draft, then call plugin_apply for the one transactional substitution. Never use this as a bootstrap for a new independent feature; use plugin_create instead.",
      inputSchema: objectSchema({
        planId: { type: "string", minLength: 1, maxLength: 200 },
      }, ["planId"]),
      needsApproval: true,
      async execute(input) {
        const plan = planForIntent(state, input, "replace");
        const result = await profile.copyAndReplace(plan.planId);
        if (result.status === "draft") {
          state.draftPlanByPlugin.set(result.pluginId, plan.planId);
        }
        return result;
      },
    },
    plugin_source_write: {
      description:
        "Atomically write a UTF-8 file inside a managed plugin draft or editable installed plugin. Bundled originals are read-only. Follow with plugin_apply only when the final candidate and its behavior test are ready.",
      inputSchema: objectSchema({
        pluginId,
        relativePath,
        content: { type: "string", maxLength: 2 * 1024 * 1024 },
      }, ["pluginId", "relativePath", "content"]),
      needsApproval: true,
      execute: async (input) => {
        const values = input as {
          pluginId: string;
          relativePath: string;
          content: string;
        };
        await profile.writeSourceFile(
          values.pluginId,
          values.relativePath,
          values.content,
        );
        return { ok: true, pluginId: values.pluginId, relativePath: values.relativePath };
      },
    },
    plugin_apply: {
      description:
        "Compile the final managed draft or edited active plugin and apply it in one transactional live generation without restarting. A new draft receives its first profile row only here. On failure the prior graph remains active and the draft stays editable.",
      inputSchema: objectSchema({ pluginId }, ["pluginId"]),
      needsApproval: true,
      async execute(input) {
        const requestedPluginId = (input as { pluginId: string }).pluginId;
        const planId = state.draftPlanByPlugin.get(requestedPluginId);
        if (!planId) {
          throw new Error(
            `plugin "${requestedPluginId}" has no authoring plan; call plugin_plan and create its draft first`,
          );
        }
        const result = await profile.apply(
          requestedPluginId,
        );
        if (result.status === "replaced") {
          state.completions.set(result.completionId, {
            pluginId: result.pluginId,
            generation: result.generation,
            planId,
          });
        }
        return result;
      },
    },
    plugin_undo: {
      description:
        "Undo one still-current successful plugin_apply by its exact completion id. This restores the complete preceding profile snapshot transactionally and rejects stale completions instead of overwriting later changes.",
      inputSchema: objectSchema({
        completionId: { type: "string", minLength: 1, maxLength: 200 },
      }, ["completionId"]),
      needsApproval: true,
      async execute(input) {
        const completionId = (input as { completionId: string }).completionId;
        if (!state.completions.has(completionId)) {
          throw new Error(
            `unknown plugin completion "${completionId}"; only this authoring session's successful applies can be undone`,
          );
        }
        const result = await profile.undo(completionId);
        if (result.status === "replaced") state.completions.delete(completionId);
        return result;
      },
    },
    plugin_activation_preview: {
      description:
        "Preview the exact blocked plugins, unavailable features, degraded optional services, and destructive resources caused by enabling or disabling a plugin. This does not mutate the profile. Show the result to the user before plugin_set_enabled.",
      inputSchema: objectSchema({
        pluginId,
        enabled: { type: "boolean" },
      }, ["pluginId", "enabled"]),
      execute: (input) => {
        const values = input as { pluginId: string; enabled: boolean };
        return profile.previewSetEnabled(values.pluginId, values.enabled);
      },
    },
    plugin_set_enabled: {
      description:
        "Commit a plugin enable or disable operation using the still-current preview id and generation returned by plugin_activation_preview. Activation is transactional and restores the prior graph on failure.",
      inputSchema: objectSchema({
        pluginId,
        enabled: { type: "boolean" },
        previewId: { type: "string", minLength: 1, maxLength: 100 },
        generation: { type: "number", minimum: 0 },
      }, ["pluginId", "enabled", "previewId", "generation"]),
      needsApproval: true,
      execute: (input) => {
        const values = input as {
          pluginId: string;
          enabled: boolean;
          previewId: string;
          generation: number;
        };
        return profile.setEnabled(values.pluginId, values.enabled, {
          previewId: values.previewId,
          generation: values.generation,
        });
      },
    },
  };
}

export function createPluginDevelopmentContribution(
  profile: PluginAuthoringProfileApi,
  evidence: UiContributionEvidenceCapability,
  changeReveal: UiChangeRevealCapability,
  onboarding?: OptionalCapability<OnboardingRegistry>,
): AiToolContribution {
  const state: PluginDevelopmentState = {
    completions: new Map(),
    plans: new Map(),
    draftPlanByPlugin: new Map(),
    planByBriefCallId: new Map(),
  };
  return {
    id: "plugin-dev",
    group: "plugin-dev",
    order: 10,
    presentations: {
      plugin_brief: pluginBriefPresentation,
      plugin_verify: createCompletionPresentation(profile, changeReveal),
    },
    build: (runtime) => createPluginDevelopmentTools(
      profile,
      evidence,
      changeReveal,
      state,
      runtime,
      onboarding,
    ),
  };
}
