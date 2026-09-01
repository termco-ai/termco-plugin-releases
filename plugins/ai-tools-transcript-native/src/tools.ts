import type { AiContextArtifactsCapability } from "@termco/ai-sessions-base";
import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";

function inputValues(input: unknown): {
  id: string;
  offset?: number;
  limit?: number;
} {
  const value = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  return {
    id: typeof value.id === "string" ? value.id : "",
    ...(typeof value.offset === "number" ? { offset: value.offset } : {}),
    ...(typeof value.limit === "number" ? { limit: value.limit } : {}),
  };
}

const inputSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Artifact id from the conversation. Never a file path.",
    },
    offset: {
      type: "integer",
      minimum: 1,
      description: "1-based line at which to start.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      description: "Maximum number of lines to return.",
    },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

export function createTranscriptContribution(
  artifacts: AiContextArtifactsCapability,
): AiToolContribution {
  return {
    id: "transcript",
    group: "core",
    order: 150,
    build() {
      const readTranscript: AiToolDefinition = {
        description:
          "Read the full, untruncated conversation transcript saved before a context compaction. Use it when a summary references an exact code snippet, error, command, or generated result you need. Page large transcripts with offset and limit.",
        inputSchema,
        async execute(input) {
          const { id, offset, limit } = inputValues(input);
          const slice = await artifacts.readTranscript(id, { offset, limit });
          return slice ?? {
            error: `no transcript "${id}". Use the id exactly as given in the compaction summary; otherwise work from the summary instead of guessing.`,
          };
        },
      };
      const readToolOutput: AiToolDefinition = {
        description:
          "Read the full output of an earlier tool call that was parked to save context. Use the id in its <persisted-output> marker. Page large results with offset and limit.",
        inputSchema,
        async execute(input) {
          const { id, offset, limit } = inputValues(input);
          const slice = await artifacts.readToolOutput(id, { offset, limit });
          return slice ?? {
            error: `no saved output "${id}". It may have aged out; rerun the original tool instead of guessing.`,
          };
        },
      };
      return {
        read_transcript: readTranscript,
        read_tool_output: readToolOutput,
      };
    },
  };
}
