/**
 * Per-model reasoning-effort capability resolution.
 *
 * A model's effort options come from (in priority order):
 *  1. an explicit `reasoning` field on the model (`config/models.ts`),
 *  2. the provider baseline, for any model carrying the `"reasoning"` tag,
 *  3. a generic base, for freeform/custom providers (local, OpenRouter,
 *     OpenAI-compatible) whose models we can't introspect,
 *  4. otherwise `undefined` — the model doesn't reason and the control is hidden.
 */

import type { ModelInfo, ReasoningEffort, ReasoningSupport } from "./models";
import { FREEFORM_PROVIDERS, type ProviderId } from "./providers";

/** Per-provider capability for reasoning-tagged models without an explicit override. */
const PROVIDER_BASELINE: Partial<Record<ProviderId, ReasoningSupport>> = {
  // OpenAI reasoning families (Responses API) accept the full effort range.
  openai: {
    levels: ["minimal", "low", "medium", "high", "xhigh"],
    default: "medium",
  },
  // Anthropic uses a token budget; opt-in (off) by default to avoid silent cost.
  anthropic: { levels: ["low", "medium", "high"], default: "off" },
  // Gemini thinkingLevel; opt-in by default.
  google: { levels: ["low", "medium", "high"], default: "off" },
  // Grok reasoning variants think by default — keep them thinking.
  xai: { levels: ["low", "medium", "high"], default: "medium" },
  deepseek: { levels: ["low", "medium", "high"], default: "low" },
  groq: { levels: ["low", "medium", "high"], default: "low" },
};

/** Base offered to custom/local models (unknown true capability, so opt-in). */
const FREEFORM_BASE: ReasoningSupport = {
  levels: ["low", "medium", "high"],
  default: "off",
};

/**
 * Resolve a model's reasoning capability, or `undefined` if it doesn't reason
 * (control hidden). Pure.
 */
export function getReasoningSupport(
  info: ModelInfo,
): ReasoningSupport | undefined {
  if (info.reasoning) return info.reasoning;
  if (info.tags?.includes("reasoning")) {
    return PROVIDER_BASELINE[info.provider] ?? FREEFORM_BASE;
  }
  // Custom/local models carry no tags; we can't know, so offer the opt-in base.
  if (FREEFORM_PROVIDERS.has(info.provider)) return FREEFORM_BASE;
  return undefined;
}

/** The effort in effect for a model given the user's stored choice (if any). */
export function effectiveEffort(
  info: ModelInfo,
  stored: ReasoningEffort | undefined,
): ReasoningEffort {
  const support = getReasoningSupport(info);
  if (!support) return "off";
  if (stored && (stored === "off" || support.levels.includes(stored))) {
    return stored;
  }
  return support.default;
}
