/**
 * Provider registry: the set of LLM backends Termco can talk to, plus the
 * helpers that answer "does this provider need / accept an API key?".
 *
 * Extracted from the former monolithic `ai/config.ts`; re-exported unchanged
 * through the public `ai.models` capability.
 */

/** Identifier for every supported LLM backend (paid API or local server). */
export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "cerebras"
  | "groq"
  | "deepseek"
  | "mistral"
  | "openrouter"
  | "openai-compatible"
  | "lmstudio"
  | "mlx"
  | "ollama";

/** Static metadata describing how to reach and authenticate a provider. */
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyringAccount: string;
  keyPrefix: string | null;
  consoleUrl: string;
  /** Provider accepts (but does not require) an API key. */
  keyOptional?: boolean;
};

/** The canonical provider list rendered by Settings and used for key lookup. */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyringAccount: "openai-api-key",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyringAccount: "anthropic-api-key",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google",
    keyringAccount: "google-api-key",
    keyPrefix: null,
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "xai",
    label: "xAI",
    keyringAccount: "xai-api-key",
    keyPrefix: "xai-",
    consoleUrl: "https://console.x.ai/",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keyringAccount: "cerebras-api-key",
    keyPrefix: "csk-",
    consoleUrl: "https://cloud.cerebras.ai/",
  },
  {
    id: "groq",
    label: "Groq",
    keyringAccount: "groq-api-key",
    keyPrefix: "gsk_",
    consoleUrl: "https://console.groq.com/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyringAccount: "deepseek-api-key",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    keyringAccount: "mistral-api-key",
    keyPrefix: null,
    consoleUrl: "https://console.mistral.ai/api-keys/",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyringAccount: "openrouter-api-key",
    keyPrefix: "sk-or-",
    consoleUrl: "https://openrouter.ai/keys",
  },
  {
    id: "openai-compatible",
    label: "OpenAI Compatible",
    keyringAccount: "openai-compatible-api-key",
    keyPrefix: null,
    consoleUrl: "https://platform.openai.com/docs/api-reference",
    keyOptional: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://lmstudio.ai/docs/basics/server",
  },
  {
    id: "mlx",
    label: "MLX",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl:
      "https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md",
  },
  {
    id: "ollama",
    label: "Ollama",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://ollama.com/download",
  },
] as const;

/** Look up a provider by id; throws if the id is not registered. */
export function getProvider(id: ProviderId): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

/**
 * Providers whose model id is user-supplied at runtime rather than drawn from
 * the static registry. Shared with the model layer to decide reasoning
 * retention. Internal to the config module — not re-exported by the barrel.
 */
export const FREEFORM_PROVIDERS: ReadonlySet<ProviderId> = new Set([
  "openrouter",
  "openai-compatible",
  "lmstudio",
  "mlx",
  "ollama",
]);

/** Providers that do not require an API key (local servers, key-optional). */
export const KEYLESS_PROVIDERS: readonly ProviderId[] = [
  "lmstudio",
  "mlx",
  "ollama",
  "openai-compatible",
] as const;

/** True when the provider must be given an API key to function. */
export function providerNeedsKey(id: ProviderId): boolean {
  return !KEYLESS_PROVIDERS.includes(id);
}

/** True for providers that accept an API key — required *or* optional.
 *  Used by Settings to decide whether to render a key card at all. */
export function providerSupportsKey(id: ProviderId): boolean {
  if (providerNeedsKey(id)) return true;
  const p = getProvider(id);
  return !!p.keyOptional;
}
