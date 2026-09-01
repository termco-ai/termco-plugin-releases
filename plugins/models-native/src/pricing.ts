/**
 * Cost model: per-model context-window limits and token pricing, plus the
 * helpers that estimate spend and surface the context-usage indicator.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

import { isCompatModelId } from "./endpoints";

/** Approximate context window (in tokens) per model. Used for the
 *  context-usage indicator in the AI mini-window header. Conservative
 *  estimates — actual provider limits may shift. */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-5.6": 1_050_000,
  "gpt-5.6-terra": 400_000,
  "gpt-5.6-luna": 400_000,
  "gpt-5.5": 1_050_000,
  "gpt-5.5-pro": 1_050_000,
  "gpt-5.4-mini": 400_000,
  "gpt-5.4-nano": 400_000,
  "gpt-5.3-codex": 400_000,
  "gpt-4.1-mini": 128_000,
  "claude-fable-5": 1_000_000,
  "claude-opus-4-8": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-opus-4-7": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-opus-4-6": 200_000,
  "gemini-3.5-flash": 1_000_000,
  "gemini-3.1-flash-lite": 1_000_000,
  "gemini-3.1-pro-preview": 1_000_000,
  "gemini-3-flash-preview": 1_000_000,
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "grok-4.5": 500_000,
  "grok-4.20-reasoning": 2_000_000,
  "grok-4.20-non-reasoning": 2_000_000,
  "grok-4-fast-reasoning": 2_000_000,
  "grok-4.3": 1_000_000,
  "grok-build-0.1": 256_000,
  "deepseek-v4-pro": 1_000_000,
  "deepseek-v4-flash": 1_000_000,
  "gpt-oss-120b": 128_000,
  "llama3.3-70b": 128_000,
  "qwen-3-32b": 32_000,
  "openai/gpt-oss-20b": 128_000,
  "llama-3.3-70b-versatile": 128_000,
  "deepseek-r1-distill-llama-70b": 128_000,
  "openrouter-custom": 256_000,
  "lmstudio-local": 32_000,
  "mlx-local": 32_000,
  "ollama-local": 32_000,
  "mistral-large-latest": 131_072,
  "mistral-medium-latest": 32_768,
  "codestral-latest": 256_000,
};

/** Resolve the context-window size for a model id, honouring a caller-supplied
 *  override for custom endpoints. Falls back to 128K when unknown. */
export function getModelContextLimit(
  modelId: string | undefined,
  compatOverride?: number,
): number {
  if (!modelId) return 128_000;
  if (isCompatModelId(modelId)) return compatOverride ?? 128_000;
  return MODEL_CONTEXT_LIMITS[modelId] ?? 128_000;
}

/** Per-million-token pricing for a model (USD). `cacheRead` defaults to `input`. */
export type ModelPricing = {
  input: number;
  output: number;
  cacheRead?: number;
};

/** Known token prices; models absent here return `null` from `estimateCost`. */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.6": { input: 5, output: 30, cacheRead: 0.5 },
  "gpt-5.6-terra": { input: 2.5, output: 15, cacheRead: 0.25 },
  "gpt-5.6-luna": { input: 1, output: 6, cacheRead: 0.1 },
  "gpt-5.5": { input: 5, output: 15, cacheRead: 0.5 },
  "gpt-5.5-pro": { input: 30, output: 180 },
  "gpt-5.4-mini": { input: 0.4, output: 1.6, cacheRead: 0.04 },
  "gpt-5.4-nano": { input: 0.1, output: 0.4, cacheRead: 0.01 },
  "gpt-5.3-codex": { input: 1.5, output: 6, cacheRead: 0.15 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cacheRead: 0.1 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "gemini-3.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.075 },
  "gemini-3.1-flash-lite": { input: 0.075, output: 0.3, cacheRead: 0.015 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10, cacheRead: 0.31 },
  "gemini-3-flash-preview": { input: 0.3, output: 2.5, cacheRead: 0.075 },
  "gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.31 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.075 },
  "grok-4.5": { input: 2, output: 6 },
  "grok-4.20-reasoning": { input: 3, output: 15 },
  "grok-4.20-non-reasoning": { input: 1, output: 5 },
  "grok-4-fast-reasoning": { input: 0.2, output: 0.5 },
  "grok-4.3": { input: 1.25, output: 2.5 },
  "grok-build-0.1": { input: 1, output: 2 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.043 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.014 },
};

/** Estimate USD spend for a usage record; `null` when the model has no pricing. */
export function estimateCost(
  modelId: string | undefined,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  },
): number | null {
  if (!modelId) return null;
  const p = MODEL_PRICING[modelId];
  if (!p) return null;
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const cached = usage.cachedInputTokens;
  return (
    (fresh * p.input +
      cached * (p.cacheRead ?? p.input) +
      usage.outputTokens * p.output) /
    1_000_000
  );
}
