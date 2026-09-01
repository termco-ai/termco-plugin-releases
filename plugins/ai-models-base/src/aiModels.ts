import type { Dispose } from "@termco/kernel";

export type AiProviderId =
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

export type AiModelCapabilityScore = 1 | 2 | 3 | 4 | 5;
export type AiModelTag = "vision" | "reasoning" | "tools" | "coding";
export type AiReasoningEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AiModelDefinition {
  id: string;
  provider: AiProviderId;
  label: string;
  hint: string;
  description: string;
  capabilities: {
    intelligence: AiModelCapabilityScore;
    speed: AiModelCapabilityScore;
    cost: AiModelCapabilityScore;
  };
  tags?: readonly AiModelTag[];
  contextWindow?: number;
  reasoning?: {
    levels: readonly AiReasoningEffort[];
    default: AiReasoningEffort;
  };
  pricing?: { input: number; output: number; cacheRead?: number };
}

export interface AiCustomModelEndpoint {
  id: string;
  name: string;
  baseURL: string;
  modelId: string;
  contextLimit: number;
}

/** One named entry in the application-wide AI model registry. The plugin that
 * contributes it owns the provider metadata and its complete built-in model
 * catalogue; settings and chat features only consume this public contract. */
export interface AiModelProviderCapability {
  id: AiProviderId;
  label: string;
  keyringAccount: string;
  keyPrefix: string | null;
  consoleUrl: string;
  keyRequirement: "required" | "optional" | "none";
  kind: "cloud" | "local" | "gateway" | "compatible";
  description: string;
  models: readonly AiModelDefinition[];
  /** Model selected when this provider supplies the application's initial
   * assistant default. At most one active provider should set this. */
  defaultModelId?: string;
  autocompleteDefaultModelId?: string;
  defaultBaseUrl?: string;
  defaultContextLimit?: number;
  customEndpoint?: {
    modelIdPrefix: string;
    keyringAccountPrefix: string;
    keyringAccountSuffix: string;
    modelIdFor(endpointId: string): string;
    endpointIdFrom(modelId: string): string | null;
    modelFor(endpoint: AiCustomModelEndpoint): AiModelDefinition;
  };
}

export interface AiModelRegistry {
  register(entry: AiModelProviderCapability): Dispose;
  snapshot(): readonly AiModelProviderCapability[];
  subscribe(listener: () => void): Dispose;
}
