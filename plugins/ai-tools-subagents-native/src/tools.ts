import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type {
  AiToolContribution,
  AiToolEntry,
  AiToolRuntime,
  AiToolsetContribution,
} from "@termco/ai-tools-base";
import { SUBAGENTS, type SubagentType } from "./registry";

const TYPES = Object.keys(SUBAGENTS) as SubagentType[];

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function selectedTools(
  contributions: readonly AiToolsetContribution[],
  runtime: AiToolRuntime,
  allowed: readonly string[],
): Record<string, AiToolEntry> {
  const available = Object.assign({}, ...contributions.map((entry) => entry.build(runtime)));
  return Object.fromEntries(allowed.flatMap((name) => available[name] ? [[name, available[name]]] : []));
}

function description(): string {
  return `Spawn an isolated subagent with a restricted read-only toolset and fresh message history. Use it for a self-contained investigation without polluting the current context.

Types:
${TYPES.map((type) => `- ${type}: ${SUBAGENTS[type].description} (use when: ${SUBAGENTS[type].whenToUse})`).join("\n")}

The subagent has no memory of this conversation. Include exact paths, line numbers, context, and the concrete question. Its result is not shown directly to the user, so verify load-bearing claims and relay the useful result yourself.`;
}

export function createSubagentTools(input: {
  inference: AiInferenceCapability;
  toolsets: readonly AiToolsetContribution[];
  runtime: AiToolRuntime;
}): Record<string, AiToolEntry> {
  return {
    run_subagent: {
      description: description(),
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: TYPES },
          prompt: { type: "string", minLength: 1, description: "Self-contained instruction with all relevant context." },
          description: { type: "string", description: "Short label shown for the delegated work." },
        },
        required: ["type", "prompt"],
        additionalProperties: false,
      },
      execute: async (raw) => {
        const args = values(raw);
        const type = String(args.type ?? "") as SubagentType;
        const prompt = String(args.prompt ?? "").trim();
        const definition = SUBAGENTS[type];
        if (!definition) return { error: `unknown subagent type: ${type}` };
        if (!prompt) return { error: "subagent prompt is required", type };
        const modelId = input.runtime.getSelectedModelId?.()?.trim();
        if (!modelId) return { error: "the active AI session did not provide a selected model", type };
        const liveId = `subagent-${crypto.randomUUID()}`;
        const steps: string[] = [];
        const report = (label: string, done = false) => input.runtime.reportProgress?.({
          id: liveId,
          title: done ? "Subagent finished" : "Subagent running",
          steps: steps.slice(-12),
          label,
          done,
        });
        try {
          const result = await input.inference.generate({
            modelId,
            instructions: definition.systemPrompt,
            prompt,
            tools: selectedTools(input.toolsets, input.runtime, definition.tools),
            maxSteps: definition.maxTurns ?? 12,
            chunkTimeoutMs: 90_000,
            onStep: ({ toolName }) => {
              if (!toolName) return;
              const label = `${type}: ${toolName}`;
              steps.push(label);
              report(label);
            },
          });
          report(`${result.stepCount} steps · ${Math.round(result.durationMs / 1000)}s`, true);
          return {
            type,
            description: typeof args.description === "string" ? args.description : undefined,
            summary: result.text,
            stepCount: result.stepCount,
            durationMs: result.durationMs,
          };
        } catch (error) {
          report("failed", true);
          return { error: error instanceof Error ? error.message : String(error), type };
        }
      },
    },
  };
}

export function createSubagentContribution(
  inference: AiInferenceCapability,
  toolsets: readonly AiToolsetContribution[],
): AiToolContribution {
  return {
    id: "subagent",
    group: "agents",
    order: 185,
    build: (runtime) => createSubagentTools({ inference, toolsets, runtime }),
  };
}
