import type { AiReasoningEffort } from "@termco/ai-models-base";
import type { AiToolEntry } from "@termco/ai-tools-base";

export interface AiInferenceStep {
  toolName?: string;
}

export interface AiInferenceRequest {
  modelId: string;
  instructions: string;
  prompt: string;
  tools?: Record<string, AiToolEntry>;
  maxSteps: number;
  /** Provider-neutral output controls for bounded foreground/background work. */
  maxOutputTokens?: number;
  temperature?: number;
  /** Opaque provider tuning owned by the consumer's workflow. */
  providerOptions?: unknown;
  /** Gap between chunks before the provider treats the run as stalled. */
  chunkTimeoutMs?: number;
  /** Optional whole-request deadline for bounded background operations. */
  totalTimeoutMs?: number;
  abortSignal?: AbortSignal;
  onStep?(step: AiInferenceStep): void;
}

export interface AiInferenceResult {
  text: string;
  stepCount: number;
  durationMs: number;
}

export interface AiInferenceConfiguration {
  configuredProviderIds: string[];
  configuredCustomEndpointIds: string[];
}

export interface AiInferenceStreamStep {
  toolCalls?: ReadonlyArray<{ toolName: string; input?: unknown }>;
  toolResults?: ReadonlyArray<{ toolName: string; output: unknown }>;
  text?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { cacheReadTokens?: number };
  };
  performance?: {
    outputTokensPerSecond?: number;
    effectiveOutputTokensPerSecond?: number;
    timeToFirstOutputMs?: number;
  };
}

/** Provider-neutral execution envelope for an interactive model stream.
 *
 * The chat plugin owns prompt construction, history compaction, tool policy,
 * and UI-message conversion. The selected inference provider owns the actual
 * model client and SDK invocation. Payload fields which are specific to the
 * shared AI SDK deliberately remain opaque at this capability boundary: a
 * replacement provider may translate them to a remote daemon or another
 * implementation without exposing credentials or model clients to consumers.
 */
export interface AiInferenceStreamRequest {
  modelId: string;
  instructions?: unknown;
  messages: readonly unknown[];
  tools: Record<string, unknown>;
  activeTools?: readonly string[];
  /** Provider-neutral effort selected by the session. The inference provider
   * owns translation to the selected model SDK's native options. */
  reasoningEffort?: AiReasoningEffort;
  providerOptions?: unknown;
  toolApproval?: unknown;
  toolApprovalSecret?: string;
  maxSteps: number;
  chunkTimeoutMs?: number;
  abortSignal?: AbortSignal;
  prepareStep?(input: {
    readonly steps: readonly AiInferenceStreamStep[];
    readonly stepNumber: number;
    readonly instructions?: unknown;
    readonly messages: readonly unknown[];
  }): PromiseLike<{ activeTools?: readonly string[] }> | {
    activeTools?: readonly string[];
  };
  onStepEnd?(step: AiInferenceStreamStep): void;
  onAbort?(): void;
  onEnd?(result: unknown): void;
}

export interface AiInferenceStreamResult {
  /** Opaque provider stream consumed by the chat plugin's protocol adapter. */
  stream: unknown;
}

/** Application-wide executable inference provider. It owns credentials,
 * endpoint resolution, provider SDKs, reusable model clients, and request
 * execution. Consumers own prompts, tool policy, and orchestration. */
export interface AiInferenceCapability {
  configuration(): Promise<AiInferenceConfiguration>;
  generate(request: AiInferenceRequest): Promise<AiInferenceResult>;
  stream(request: AiInferenceStreamRequest): Promise<AiInferenceStreamResult>;
}
