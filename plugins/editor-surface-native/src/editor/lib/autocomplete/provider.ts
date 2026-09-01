import { editorRuntime } from "../../../runtime";
import {
  buildUserPrompt,
  COMPLETION_SYSTEM_PROMPT,
  type CompletionRequest,
} from "./prompt";

export type CompletionDeps = {
  /** Public model-registry id selected in Settings. */
  modelId: string;
};

const MAX_OUTPUT_TOKENS_DEFAULT = 128;
// Reasoning models burn output tokens before producing visible text.
const MAX_OUTPUT_TOKENS_REASONING = 1024;

export async function requestCompletion(
  request: CompletionRequest,
  deps: CompletionDeps,
  signal: AbortSignal,
): Promise<string> {
  const modelId = deps.modelId.trim();
  if (!modelId) throw new Error("No autocomplete model is selected.");

  const isReasoning = /\bgpt-oss\b/i.test(modelId);
  const result = await editorRuntime().inference.generate({
    modelId,
    instructions: COMPLETION_SYSTEM_PROMPT,
    prompt: buildUserPrompt(request),
    maxSteps: 1,
    maxOutputTokens: isReasoning
      ? MAX_OUTPUT_TOKENS_REASONING
      : MAX_OUTPUT_TOKENS_DEFAULT,
    totalTimeoutMs: 15_000,
    abortSignal: signal,
    temperature: 0.2,
    ...(isReasoning
      ? {
          providerOptions: {
            cerebras: { reasoningEffort: "low" },
            groq: { reasoningEffort: "low" },
            openai: { reasoningEffort: "low" },
          },
        }
      : {}),
  });

  return cleanCompletion(result.text);
}

function cleanCompletion(raw: string): string {
  let text = raw;
  const fence = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fence) text = fence[1];
  return text.replace(/^<\|cursor\|>/, "");
}
