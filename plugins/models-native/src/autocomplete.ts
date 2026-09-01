/**
 * Inline autocomplete configuration: which providers/models can drive the
 * editor's inline completion and the per-provider default model choices.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

import type { ModelInfo } from "./models";
import { MODELS } from "./models";
import type { ProviderId } from "./providers";

/** Any provider can power the editor's inline autocomplete; latency is the
 *  user's choice. The picker filters down to fast tiers in the UI. */
export type AutocompleteProviderId = ProviderId;

/** Sensible default model id per provider for inline autocomplete. */
export const DEFAULT_AUTOCOMPLETE_MODEL: Partial<Record<ProviderId, string>> = {
  cerebras: "gpt-oss-120b",
  groq: "openai/gpt-oss-20b",
  lmstudio: "qwen2.5-coder-7b-instruct",
  openai: "gpt-5.4-nano",
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash",
  xai: "grok-4.3",
  deepseek: "deepseek-v4-flash",
  openrouter: "openai/gpt-5.4-mini",
  "openai-compatible": "",
};

/** Curated list of fast models suitable for inline completion (speed ≥ 4). */
export function getAutocompleteEligibleModels(): readonly ModelInfo[] {
  return MODELS.filter((model) => model.capabilities.speed >= 4);
}
