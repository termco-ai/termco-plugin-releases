/**
 * Model registry: every selectable model, its capability scores and tags, the
 * `ModelId` union derived from the registry, and the resolvers that turn a raw
 * id (static or custom-endpoint) into a `ModelInfo`.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

import type { CustomEndpoint } from "./endpoints";
import { getCompatModelInfo, isCompatModelId } from "./endpoints";
import type { ProviderId } from "./providers";
import { FREEFORM_PROVIDERS } from "./providers";

/** 1 (lowest) – 5 (highest). For `cost`, higher = cheaper. */
type CapabilityScore = 1 | 2 | 3 | 4 | 5;

/** Per-model capability profile used for UI sorting and filtering. */
type ModelCapabilities = {
  intelligence: CapabilityScore;
  speed: CapabilityScore;
  cost: CapabilityScore;
};

/** Feature tags a model may advertise. */
export type ModelTag = "vision" | "reasoning" | "tools" | "coding";

/**
 * Normalized thinking-effort scale, ordered from least to most. `"off"` disables
 * reasoning. Each provider accepts a subset — the mapping in
 * `lib/agent/reasoningOptions.ts` clamps to what the provider supports.
 */
export type ReasoningEffort =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** Per-model reasoning capability: which effort levels to offer + the default. */
export type ReasoningSupport = {
  /** Levels offered in the UI (besides `"off"`, which is always available). */
  levels: readonly ReasoningEffort[];
  /** Effort applied when the user hasn't chosen one for this model. */
  default: ReasoningEffort;
};

/** Static description of a selectable model. */
export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  /** One short word for the dropdown trigger. */
  hint: string;
  /** One-line marketing-style description shown under the label. */
  description: string;
  capabilities: ModelCapabilities;
  tags?: readonly ModelTag[];
  /**
   * Reasoning-effort capability. Optional — when omitted, `getReasoningSupport`
   * (config/reasoning.ts) derives it from the provider baseline for any model
   * carrying the `"reasoning"` tag (or the freeform-provider base for custom
   * models). Set this only to override the baseline for a specific model.
   */
  reasoning?: ReasoningSupport;
};

/** The full catalogue of registered models, grouped by provider. */
export const MODELS = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    id: "gpt-5.6",
    provider: "openai",
    label: "GPT-5.6",
    hint: "Flagship",
    description: "Frontier reasoning and code (GPT-5.6 “Sol”).",
    capabilities: { intelligence: 5, speed: 3, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "gpt-5.6-terra",
    provider: "openai",
    label: "GPT-5.6 Terra",
    hint: "Balanced",
    description: "Balanced GPT-5.6 tier — strong quality at lower cost.",
    capabilities: { intelligence: 4, speed: 4, cost: 3 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "gpt-5.6-luna",
    provider: "openai",
    label: "GPT-5.6 Luna",
    hint: "Fast",
    description: "Fast, affordable GPT-5.6 for high-volume tasks.",
    capabilities: { intelligence: 4, speed: 5, cost: 4 },
    tags: ["vision", "tools"],
  },
  {
    id: "gpt-5.5",
    provider: "openai",
    label: "GPT-5.5",
    hint: "Previous",
    description: "Previous-gen frontier reasoning and code.",
    capabilities: { intelligence: 5, speed: 3, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "gpt-5.5-pro",
    provider: "openai",
    label: "GPT-5.5 Pro",
    hint: "Max",
    description:
      "Highest-accuracy version for the hardest professional and agentic tasks.",
    capabilities: { intelligence: 5, speed: 2, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
    // Max-accuracy tier: default to a higher thinking budget than the baseline.
    reasoning: { levels: ["low", "medium", "high", "xhigh"], default: "high" },
  },
  {
    id: "gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    hint: "Fast",
    description: "Snappy default at low cost.",
    capabilities: { intelligence: 4, speed: 4, cost: 4 },
    tags: ["vision", "tools"],
  },
  {
    id: "gpt-5.4-nano",
    provider: "openai",
    label: "GPT-5.4 nano",
    hint: "Fastest",
    description: "Tiny and instant — great for autocomplete.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"],
  },
  {
    id: "gpt-5.3-codex",
    provider: "openai",
    label: "GPT-5.3 Codex",
    hint: "Coding",
    description: "Tuned for code and tool use.",
    capabilities: { intelligence: 4, speed: 4, cost: 3 },
    tags: ["tools", "coding"],
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 mini",
    hint: "Cheap",
    description: "Ultra-cheap workhorse for bulk tasks.",
    capabilities: { intelligence: 3, speed: 4, cost: 5 },
    tags: ["vision", "tools"],
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    id: "claude-fable-5",
    provider: "anthropic",
    label: "Claude Fable 5",
    hint: "Best",
    description:
      "Anthropic's most capable model — frontier reasoning and long-horizon agentic coding, 1M context.",
    capabilities: { intelligence: 5, speed: 3, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "Claude Opus 4.8",
    hint: "Powerful",
    description:
      "Deep reasoning and long-horizon agentic coding at a lower price than Fable.",
    capabilities: { intelligence: 5, speed: 2, cost: 2 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    hint: "Balanced",
    description: "Sweet spot of quality and speed; strong tool use.",
    capabilities: { intelligence: 4, speed: 4, cost: 3 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "claude-opus-4-7",
    provider: "anthropic",
    label: "Claude Opus 4.7",
    hint: "Legacy",
    description: "Previous-gen Opus for long reasoning.",
    capabilities: { intelligence: 5, speed: 2, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    hint: "Fast",
    description: "Quick, cheap, multimodal.",
    capabilities: { intelligence: 3, speed: 5, cost: 4 },
    tags: ["vision", "tools"],
  },
  {
    id: "claude-opus-4-6",
    provider: "anthropic",
    label: "Claude Opus 4.6",
    hint: "Legacy",
    description: "Previous-gen Opus.",
    capabilities: { intelligence: 5, speed: 2, cost: 1 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },

  // ── Google ────────────────────────────────────────────────────────────────
  {
    id: "gemini-3.5-flash",
    provider: "google",
    label: "Gemini 3.5 Flash",
    hint: "Fast",
    description: "High-intelligence, extremely fast multimodal model.",
    capabilities: { intelligence: 4, speed: 5, cost: 4 },
    tags: ["vision", "tools", "coding"],
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "google",
    label: "Gemini 3.1 Flash-Lite",
    hint: "Lite",
    description: "Extremely fast, cheap, and lightweight multimodal model.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["vision", "tools"],
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "google",
    label: "Gemini 3.1 Pro",
    hint: "Flagship",
    description: "Strong reasoning, 1M context.",
    capabilities: { intelligence: 5, speed: 3, cost: 2 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "gemini-3-flash-preview",
    provider: "google",
    label: "Gemini 3 Flash",
    hint: "Fast",
    description: "Fast multimodal, 1M context.",
    capabilities: { intelligence: 4, speed: 5, cost: 4 },
    tags: ["vision", "tools"],
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    label: "Gemini 2.5 Pro",
    hint: "Stable",
    description: "Production-stable Gemini.",
    capabilities: { intelligence: 4, speed: 3, cost: 3 },
    tags: ["vision", "tools", "coding"],
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    label: "Gemini 2.5 Flash",
    hint: "Cheap",
    description: "Bulk throughput at low cost.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["vision", "tools"],
  },

  // ── xAI ───────────────────────────────────────────────────────────────────
  {
    id: "grok-4.5",
    provider: "xai",
    label: "Grok 4.5",
    hint: "Flagship",
    description:
      "xAI's newest Opus-class model, tuned for coding and agentic work.",
    capabilities: { intelligence: 5, speed: 4, cost: 3 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "grok-4.20-reasoning",
    provider: "xai",
    label: "Grok 4.20 Reasoning",
    hint: "Reasoning",
    description: "Frontier reasoning with extended thinking.",
    capabilities: { intelligence: 5, speed: 2, cost: 2 },
    tags: ["reasoning", "tools", "coding"],
  },
  {
    id: "grok-4.20-non-reasoning",
    provider: "xai",
    label: "Grok 4.20",
    hint: "Fast",
    description: "Fast tier for chat and tools.",
    capabilities: { intelligence: 4, speed: 4, cost: 3 },
    tags: ["tools"],
  },
  {
    id: "grok-4-fast-reasoning",
    provider: "xai",
    label: "Grok 4 Fast",
    hint: "Reasoning",
    description: "Cheaper Grok 4 with vision and reasoning.",
    capabilities: { intelligence: 4, speed: 4, cost: 4 },
    tags: ["vision", "reasoning", "tools"],
  },
  {
    id: "grok-4.3",
    provider: "xai",
    label: "Grok 4.3",
    hint: "Previous",
    description: "Previous flagship. Strong agentic tool use and 1M context.",
    capabilities: { intelligence: 5, speed: 4, cost: 2 },
    tags: ["vision", "reasoning", "tools", "coding"],
  },
  {
    id: "grok-build-0.1",
    provider: "xai",
    label: "Grok Build 0.1",
    hint: "Coding",
    description:
      "Specialized fast coding model for agentic workflows (powers Grok Build CLI).",
    capabilities: { intelligence: 4, speed: 5, cost: 4 },
    tags: ["tools", "coding"],
  },

  // ── Hosted provider models ─────────────────────────────────────────────────
  {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    label: "DeepSeek V4 Pro",
    hint: "Best",
    description: "Strong open-weight code model.",
    capabilities: { intelligence: 5, speed: 3, cost: 4 },
    tags: ["reasoning", "tools", "coding"],
  },
  {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    label: "DeepSeek V4 Flash",
    hint: "Fast",
    description:
      "Cheap and fast everyday tier with a thinking mode (supersedes deepseek-reasoner).",
    capabilities: { intelligence: 4, speed: 5, cost: 5 },
    tags: ["reasoning", "tools"],
  },

  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    id: "mistral-large-latest",
    provider: "mistral",
    label: "Mistral Large 3",
    hint: "Best",
    description: "Flagship Mistral model with 128K context.",
    capabilities: { intelligence: 5, speed: 3, cost: 3 },
    tags: ["vision", "tools", "coding"],
  },
  {
    id: "mistral-medium-latest",
    provider: "mistral",
    label: "Mistral Medium 3.5",
    hint: "Balanced",
    description: "Good balance of speed and intelligence.",
    capabilities: { intelligence: 4, speed: 4, cost: 4 },
    tags: ["vision", "tools"],
  },
  {
    id: "codestral-latest",
    provider: "mistral",
    label: "Codestral",
    hint: "Code",
    description: "Purpose-built coding model from Mistral.",
    capabilities: { intelligence: 4, speed: 4, cost: 4 },
    tags: ["coding"],
  },

  // ── Cerebras (autocomplete-tier) ──────────────────────────────────────────
  {
    id: "gpt-oss-120b",
    provider: "cerebras",
    label: "GPT-OSS 120B",
    hint: "Ultra-fast",
    description: "Fastest inference on Cerebras silicon.",
    capabilities: { intelligence: 4, speed: 5, cost: 4 },
    tags: ["tools", "coding"],
  },
  {
    id: "llama3.3-70b",
    provider: "cerebras",
    label: "Llama 3.3 70B",
    hint: "Fast",
    description: "Meta's open model on wafer-scale silicon.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"],
  },
  {
    id: "qwen-3-32b",
    provider: "cerebras",
    label: "Qwen 3 32B",
    hint: "Fast",
    description: "Multilingual model at extreme speed.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools", "coding"],
  },

  // ── Groq (autocomplete-tier) ──────────────────────────────────────────────
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    label: "GPT-OSS 20B",
    hint: "Ultra-fast",
    description: "Sub-second responses on Groq LPU.",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools", "coding"],
  },
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    label: "Llama 3.3 70B",
    hint: "Versatile",
    description: "Fast and broadly capable.",
    capabilities: { intelligence: 4, speed: 5, cost: 5 },
    tags: ["tools"],
  },
  {
    id: "deepseek-r1-distill-llama-70b",
    provider: "groq",
    label: "DeepSeek R1 Distill 70B",
    hint: "Thinking",
    description: "Reasoning-distilled Llama on Groq.",
    capabilities: { intelligence: 4, speed: 5, cost: 5 },
    tags: ["reasoning", "tools"],
  },

  // ── OpenRouter (gateway; model id is user-supplied at runtime) ────────────
  {
    id: "openrouter-custom",
    provider: "openrouter",
    label: "OpenRouter",
    hint: "Configurable",
    description: "Any model on OpenRouter by id.",
    capabilities: { intelligence: 3, speed: 3, cost: 3 },
  },

  // ── LM Studio (local; model id is user-supplied at runtime) ───────────────
  {
    id: "lmstudio-local",
    provider: "lmstudio",
    label: "LM Studio",
    hint: "Local",
    description: "Local GGUF models via LM Studio.",
    capabilities: { intelligence: 3, speed: 3, cost: 5 },
  },

  // ── MLX (local; Apple-silicon; model id is user-supplied at runtime) ──────
  {
    id: "mlx-local",
    provider: "mlx",
    label: "MLX",
    hint: "Local",
    description: "Apple-silicon models via mlx_lm.server.",
    capabilities: { intelligence: 3, speed: 3, cost: 5 },
  },

  // ── Ollama (local; model id is user-supplied at runtime) ──────────────────
  {
    id: "ollama-local",
    provider: "ollama",
    label: "Ollama",
    hint: "Local",
    description: "Local models via Ollama.",
    capabilities: { intelligence: 3, speed: 3, cost: 5 },
  },
] as const satisfies readonly ModelInfo[];

/** Union of every statically-registered model id. */
export type ModelId = (typeof MODELS)[number]["id"];

/** Resolve any model id — static or custom-endpoint — to a `ModelInfo`. */
export function resolveModel(
  modelId: string,
  endpoints: readonly CustomEndpoint[] = [],
): ModelInfo {
  if (isCompatModelId(modelId)) return getCompatModelInfo(modelId, endpoints);
  const m = MODELS.find((x) => x.id === modelId);
  if (!m) throw new Error(`Unknown model: ${modelId}`);
  return m;
}

/** Resolve a known static model id to its `ModelInfo`; throws if unknown. */
export function getModel(id: ModelId): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

/** Type guard: is `id` one of the statically-registered model ids? */
export function isKnownModelId(id: string): id is ModelId {
  return MODELS.some((x) => x.id === id);
}

// Reasoning models reject tool-call turns whose reasoning was stripped; keep it.
// OpenAI is always included: the Responses API pairs each replayed
// function_call item with its reasoning item and 400s when it's missing — even
// for models we haven't tagged "reasoning" (e.g. fast tiers that still reason).
// Models that never emit reasoning have nothing to keep, so this is free.
export function modelKeepsReasoning(m: ModelInfo): boolean {
  return (
    (m.tags?.includes("reasoning") ?? false) ||
    m.provider === "openai" ||
    FREEFORM_PROVIDERS.has(m.provider)
  );
}
