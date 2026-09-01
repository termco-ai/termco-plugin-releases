import type {
  ApprovalId,
  CompactionId,
  RequestId,
  RetryId,
  SessionId,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
} from "./identity";
import type { JsonObject, JsonValue } from "./json";

export interface PluginProvenance {
  readonly pluginId: string;
  readonly revision?: string;
  readonly contributionId?: string;
}

export type CanonicalContent = JsonValue;
export type CanonicalUserMessage = JsonObject;
export type CanonicalAssistantMessage = JsonObject;
export type CanonicalToolResultMessage = JsonObject;
export type CanonicalStreamChunk = JsonObject;
export type StructuredModelFailure = JsonObject;
export type ResolvedApprovalPolicy = JsonObject;
export type ApprovalReason = JsonObject;
export type AgentCancelCause = JsonObject;
export type AuxiliaryRequestDescriptor = JsonObject;
export type ToolPresentationIntent = JsonObject;
export type InputAttribution = JsonObject;

export interface TokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly providerTotalTokens?: number;
  readonly estimated?: boolean;
}

export interface RequestPerformance {
  readonly requestStartedAt: number;
  readonly firstByteAt?: number;
  readonly firstChunkAt?: number;
  readonly firstTextAt?: number;
  readonly firstReasoningAt?: number;
  readonly endedAt?: number;
  readonly timeToFirstTokenMs?: number;
  readonly decodeDurationMs?: number;
  readonly outputTokensPerSecond?: number;
}

export interface ToolTiming {
  readonly startedAt: number;
  readonly endedAt?: number;
}

export interface CompactionPolicyState {
  readonly declined: boolean;
  readonly health: {
    readonly consecutiveFailures: number;
    readonly breakerOpen?: "failure" | "thrash";
    readonly turnsSinceCompact: number;
    readonly rapidRefills: number;
    readonly nextAttemptAfter?: number;
  };
}

export interface EffectiveRequestHeader {
  readonly fidelity?: "full" | "adapter";
  readonly selectedModelId: string;
  readonly providerRoute: string;
  readonly providerModelId: string;
  readonly reasoningEffort?: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly topK?: number;
  readonly stop?: readonly string[];
  readonly seed?: number;
  readonly providerOptions?: JsonObject;
  readonly systemPrompt: string;
  readonly messages: readonly JsonValue[];
  readonly tools: readonly JsonObject[];
  readonly activeTools: readonly string[];
  readonly maxSteps?: number;
  readonly chunkTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
  readonly approvalPolicy: JsonObject;
  readonly provenance?: readonly PluginProvenance[];
  readonly unknownControls?: readonly string[];
}

export type TurnStartCause = "user" | "followup" | "goal-continuation" | "cold-resume";

export type TurnEndReason =
  | { readonly kind: "completed" }
  | { readonly kind: "aborted"; readonly cause: AgentCancelCause }
  | { readonly kind: "blocked"; readonly reason?: string }
  | { readonly kind: "provider-error"; readonly failure: StructuredModelFailure }
  | { readonly kind: "max-output-tokens" }
  | { readonly kind: "max-steps" }
  | { readonly kind: "approval-terminal"; readonly outcome: "rejected" | "unavailable" }
  | { readonly kind: "interrupted"; readonly repair: true };

export type StepEndReason = "completed" | "aborted" | "provider-error" | "max-steps" | "interrupted";

export interface TurnSuspension {
  readonly turn: TurnId;
  readonly step: StepId;
  readonly reason: "human-input";
  readonly callIds: readonly ToolCallId[];
  readonly approvalIds: readonly ApprovalId[];
}

declare module "./events" {
  interface SessionEventMap {
    "session/end-seed": Record<string, never>;
    "session/title": {
      readonly title: string;
      readonly source: "system" | "user" | "model";
      readonly sourceEventSeqs?: readonly SessionSeq[];
    };
    "session/policy": {
      readonly approval: "ask" | "allow-safe" | "deny";
      readonly sandbox?: string;
      readonly source: "default" | "user" | "profile" | "fork";
    };
    "session/pin": { readonly pinned: boolean };
    "session/label": { readonly label: string; readonly operation: "add" | "remove" };
    "session/rig": {
      readonly rigId: string | null;
      readonly source: "user" | "workspace" | "fork";
    };
    "turn/start": { readonly turn: TurnId; readonly cause: TurnStartCause };
    "turn/suspend": TurnSuspension;
    "turn/resume": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly cause: "response" | "cancel";
    };
    "turn/end": { readonly turn: TurnId; readonly reason: TurnEndReason };
    "step/start": { readonly turn: TurnId; readonly step: StepId };
    "step/end": { readonly turn: TurnId; readonly step: StepId; readonly reason?: StepEndReason };
    "user/message": {
      readonly turn: TurnId;
      readonly message: CanonicalUserMessage;
      readonly source: "human" | "followup" | "steer" | "inject" | "goal";
      readonly attribution?: InputAttribution;
    };
    "context/injected": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly kind: string;
      readonly content: CanonicalContent;
      readonly contributor: PluginProvenance;
      readonly modelVisible: boolean;
    };
    "request/header": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly requestId: RequestId;
      readonly reason: "initial" | "resume" | "change" | "step";
      readonly header: EffectiveRequestHeader;
    };
    "request/context": {
      readonly requestId: RequestId;
      readonly providerRoute: string;
      readonly providerModelId: string;
      readonly selectedModelId: string;
      readonly contextWindow?: number;
      readonly maxOutputTokens?: number;
      readonly adapterDefaults?: JsonObject;
    };
    "request/attempt": { readonly requestId: RequestId; readonly attempt: number; readonly retryId?: RetryId };
    "request/failure": { readonly requestId: RequestId; readonly attempt: number; readonly failure: StructuredModelFailure };
    "assistant/chunk": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly requestId: RequestId;
      readonly chunk: CanonicalStreamChunk;
    };
    "assistant/message": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly requestId: RequestId;
      readonly message: CanonicalAssistantMessage;
      readonly usage?: TokenUsage;
      readonly performance?: RequestPerformance;
      readonly finishReason: string;
      readonly interrupted?: true;
    };
    "tool/call": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly requestId: RequestId;
      readonly callId: ToolCallId;
      readonly name: string;
      readonly rawArguments: string;
      readonly parsedInput?: JsonValue;
      readonly contributor: PluginProvenance;
      readonly concurrency: "safe" | "exclusive";
    };
    "approval/request": {
      readonly approvalId: ApprovalId;
      readonly callId: ToolCallId;
      readonly policy: ResolvedApprovalPolicy;
      readonly reason: ApprovalReason;
    };
    "approval/decision": {
      readonly approvalId: ApprovalId;
      readonly callId: ToolCallId;
      readonly outcome: "allowed-once" | "allowed-by-policy" | "rejected" | "cancelled" | "unavailable";
      readonly responder?: "user" | "policy" | "parent";
    };
    "tool/result": {
      readonly turn: TurnId;
      readonly step: StepId;
      readonly callId: ToolCallId;
      readonly canonicalOutput: JsonValue;
      readonly modelContent: CanonicalToolResultMessage;
      readonly presentation?: ToolPresentationIntent;
      readonly error?: { readonly name: string; readonly code: string; readonly message: string };
      readonly timing?: ToolTiming;
      readonly recovered?: "not-started" | "outcome-unknown";
    };
    "retry/scheduled": {
      readonly retryId: RetryId;
      readonly requestId: RequestId;
      readonly previousAttempt: number;
      readonly nextAttempt: number;
      readonly delayMs: number;
      readonly reason: StructuredModelFailure;
    };
    "retry/started": { readonly retryId: RetryId; readonly requestId: RequestId; readonly attempt: number };
    "retry/cancelled": { readonly retryId: RetryId; readonly reason: AgentCancelCause };
    "compaction/start": {
      readonly compactionId: CompactionId;
      readonly trigger: "automatic" | "manual" | "provider-overflow";
      readonly measuredTokens: number;
      readonly candidate: { readonly start: SessionSeq; readonly end: SessionSeq };
      readonly policyRevision: string;
    };
    "compaction/summary": {
      readonly compactionId: CompactionId;
      readonly request: AuxiliaryRequestDescriptor;
      readonly summary: CanonicalContent;
      readonly usage?: TokenUsage;
      readonly rawOutput?: CanonicalAssistantMessage;
    };
    "compaction/message": { readonly compactionId: CompactionId; readonly content: CanonicalContent };
    "compaction/end": {
      readonly compactionId: CompactionId;
      readonly outcome: "succeeded" | "failed" | "cancelled" | "declined";
      readonly failure?: StructuredModelFailure;
    };
    "compaction/policy": CompactionPolicyState & {
      readonly reason: "failure" | "success" | "manual-success" | "declined" | "context-recovered";
    };
    "workspace/checkpoint": {
      readonly checkpointId: string;
      readonly backend: string;
      readonly reference: JsonValue;
      readonly summary?: string;
    };
    "subagent/start": { readonly childSessionId: SessionId; readonly request: JsonValue };
    "subagent/report": {
      readonly childSessionId: SessionId;
      readonly content: CanonicalContent;
      readonly sourceEventSeqs?: readonly SessionSeq[];
    };
    "subagent/end": { readonly childSessionId: SessionId; readonly outcome: string };
    "adapter/event": { readonly adapter: string; readonly kind: string; readonly payload: JsonValue };
  }

  interface SessionSurfaceEventMap {
    "user/message": true;
    "assistant/message": true;
    "tool/result": true;
    "compaction/message": true;
  }
}

export {};
