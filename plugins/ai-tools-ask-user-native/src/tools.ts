import type {
  AiToolContribution,
  AiToolEntry,
  AiToolPresentationAdapter,
} from "@termco/ai-tools-base";

export const ASK_USER_TOOL_NAME = "ask_user";

/** Output written by the interactive question card when it resumes a run. */
export type AskUserOutput = {
  answer: string;
  selected?: string[];
  freeText?: boolean;
  skipped?: boolean;
  stopped?: boolean;
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Tolerant normalization is intentional: tool input arrives incrementally,
 * so the chat may draw the question shell before the JSON payload is done. */
export function parseAskUserInput(input: unknown): Record<string, unknown> {
  const raw = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const options: Array<Record<string, unknown>> = [];
  if (Array.isArray(raw.options)) {
    for (const option of raw.options) {
      const entry = option && typeof option === "object"
        ? option as Record<string, unknown>
        : {};
      const label = nonEmptyString(entry.label);
      if (!label) continue;
      options.push({
        label,
        description: nonEmptyString(entry.description),
        recommended: entry.recommended === true,
      });
    }
  }
  return {
    question: nonEmptyString(raw.question) ?? "",
    context: nonEmptyString(raw.context),
    options,
    allowFreeText:
      typeof raw.allowFreeText === "boolean" ? raw.allowFreeText : undefined,
    multiSelect: raw.multiSelect === true,
    topic: nonEmptyString(raw.topic),
    estimatedRemaining:
      typeof raw.estimatedRemaining === "number" &&
      Number.isFinite(raw.estimatedRemaining)
        ? Math.max(0, Math.trunc(raw.estimatedRemaining))
        : undefined,
  };
}

export function parseAskUserOutput(output: unknown): AskUserOutput | null {
  if (!output || typeof output !== "object") return null;
  const raw = output as Record<string, unknown>;
  if (typeof raw.answer !== "string") return null;
  return {
    answer: raw.answer,
    selected: Array.isArray(raw.selected)
      ? raw.selected.filter((value): value is string => typeof value === "string")
      : undefined,
    freeText: raw.freeText === true,
    skipped: raw.skipped === true,
    stopped: raw.stopped === true,
  };
}

export const askUserPresentation: AiToolPresentationAdapter = {
  renderer: "ask-user",
  interactive: true,
  parseInput: parseAskUserInput,
  parseOutput: parseAskUserOutput,
};

export function createAskUserContribution(): AiToolContribution {
  const askUser: AiToolEntry = {
    description:
      "Put ONE decision to the user and wait for their answer. Use it for choices that genuinely belong to the user — never for facts you can establish with available tools; look those up instead of asking. Offer 2–4 concrete choices and mark exactly one recommended, with the reasoning in its description. One question per call, never batch. The run pauses until the user answers, so do not call anything else in the same step.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          minLength: 1,
          description: "The single decision that needs to be settled.",
        },
        context: {
          type: "string",
          description: "Why this matters now and what depends on it.",
        },
        options: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              label: { type: "string", minLength: 1 },
              description: { type: "string" },
              recommended: { type: "boolean" },
            },
            required: ["label"],
            additionalProperties: false,
          },
        },
        allowFreeText: { type: "boolean" },
        multiSelect: { type: "boolean" },
        topic: { type: "string" },
        estimatedRemaining: { type: "integer", minimum: 0 },
      },
      required: ["question"],
      additionalProperties: false,
    },
  };
  return {
    id: "ask-user",
    group: "core",
    order: 160,
    presentations: { [ASK_USER_TOOL_NAME]: askUserPresentation },
    build: () => ({ [ASK_USER_TOOL_NAME]: askUser }),
  };
}
