import type {
  AiModelProviderCapability,
  AiProviderId,
} from "@termco/ai-models-base";
import type { PluginModule } from "@termco/kernel";
import { DEFAULT_AUTOCOMPLETE_MODEL } from "./autocomplete";
import {
  LMSTUDIO_DEFAULT_BASE_URL,
  MLX_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
} from "./base-urls";
import { MODELS } from "./models";
import {
  compatModelIdForEndpoint,
  endpointIdFromCompatModel,
  getCompatModelInfo,
  isCompatModelId,
} from "./endpoints";
import { MODEL_CONTEXT_LIMITS, MODEL_PRICING } from "./pricing";
import { PROVIDERS, providerNeedsKey, providerSupportsKey } from "./providers";
import { getReasoningSupport } from "./reasoning";
import { createModelRegistry } from "./modelRegistry";
import { AI_MODELS_SERVICE } from "@termco/ai-models-base";

const DESCRIPTIONS: Record<AiProviderId, string> = {
  openai: "OpenAI hosted language and reasoning models.",
  anthropic: "Anthropic Claude language and reasoning models.",
  google: "Google Gemini multimodal models.",
  xai: "xAI Grok language, reasoning, and coding models.",
  cerebras: "Low-latency inference on Cerebras hardware.",
  groq: "Low-latency hosted open models.",
  deepseek: "DeepSeek language and reasoning models.",
  mistral: "Mistral language and coding models.",
  openrouter: "A gateway to models available through OpenRouter.",
  "openai-compatible": "Any named OpenAI-compatible HTTP endpoint.",
  lmstudio: "Models served locally by LM Studio.",
  mlx: "Models served locally by mlx_lm.server on Apple silicon.",
  ollama: "Models served locally by Ollama.",
};

const BASE_URLS: Partial<Record<AiProviderId, string>> = {
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  mlx: MLX_DEFAULT_BASE_URL,
  ollama: OLLAMA_DEFAULT_BASE_URL,
  "openai-compatible": OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
};

function kind(id: AiProviderId): AiModelProviderCapability["kind"] {
  if (id === "openrouter") return "gateway";
  if (id === "openai-compatible") return "compatible";
  if (id === "lmstudio" || id === "mlx" || id === "ollama") return "local";
  return "cloud";
}

export const MODEL_PROVIDERS: readonly AiModelProviderCapability[] = PROVIDERS.map(
  (provider) => ({
    ...provider,
    keyRequirement: providerNeedsKey(provider.id)
      ? "required"
      : providerSupportsKey(provider.id)
        ? "optional"
        : "none",
    kind: kind(provider.id),
    description: DESCRIPTIONS[provider.id],
    models: MODELS.filter((model) => model.provider === provider.id).map((model) => ({
      ...model,
      contextWindow: MODEL_CONTEXT_LIMITS[model.id],
      reasoning: getReasoningSupport(model),
      pricing: MODEL_PRICING[model.id],
    })),
    defaultModelId: provider.id === "openai" ? "gpt-5.4-mini" : undefined,
    autocompleteDefaultModelId: DEFAULT_AUTOCOMPLETE_MODEL[provider.id],
    defaultBaseUrl: BASE_URLS[provider.id],
    defaultContextLimit: provider.id === "openai-compatible" ? 128_000 : undefined,
    customEndpoint: provider.id === "openai-compatible" ? {
      modelIdPrefix: "compat-",
      keyringAccountPrefix: "compat-",
      keyringAccountSuffix: "-api-key",
      modelIdFor: compatModelIdForEndpoint,
      endpointIdFrom: (modelId) =>
        isCompatModelId(modelId) ? endpointIdFromCompatModel(modelId) : null,
      modelFor: (endpoint) => {
        const model = getCompatModelInfo(
          compatModelIdForEndpoint(endpoint.id),
          [endpoint],
        );
        return {
          ...model,
          contextWindow: endpoint.contextLimit,
          reasoning: getReasoningSupport(model),
        };
      },
    } : undefined,
  }),
);

const plugin: PluginModule = {
  async activate(context) {
    const registry = createModelRegistry();
    context.provide(AI_MODELS_SERVICE, registry);
    for (const provider of MODEL_PROVIDERS) {
      await context.effect(() => registry.register(provider));
    }
  },
};

export default plugin;
