import type { AiProviderId, AiReasoningEffort } from "@termco/ai-models-base";

export type ReasoningLevel =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

const PASSTHROUGH_PROVIDERS: ReadonlySet<AiProviderId> = new Set([
  "cerebras",
  "deepseek",
  "openai-compatible",
  "openrouter",
  "lmstudio",
  "mlx",
  "ollama",
]);

export function reasoningLevel(
  provider: AiProviderId,
  effort: AiReasoningEffort,
): ReasoningLevel {
  if (effort === "off") return "none";
  if (PASSTHROUGH_PROVIDERS.has(provider)) {
    if (effort === "minimal") return "low";
    if (effort === "xhigh") return "high";
  }
  return effort;
}

export function reasoningProviderOptions(
  provider: AiProviderId,
): Record<string, Record<string, unknown>> {
  switch (provider) {
    case "google":
      return { google: { thinkingConfig: { includeThoughts: true } } };
    case "groq":
      return { groq: { reasoningFormat: "parsed" } };
    default:
      return {};
  }
}

export function mergeProviderOptions(
  base: unknown,
  addition: Record<string, Record<string, unknown>>,
): unknown {
  const source = base && typeof base === "object"
    ? base as Record<string, unknown>
    : {};
  const result: Record<string, unknown> = { ...source };
  for (const [provider, value] of Object.entries(addition)) {
    const existing = source[provider];
    result[provider] = {
      ...(existing && typeof existing === "object" ? existing : {}),
      ...value,
    };
  }
  return result;
}
