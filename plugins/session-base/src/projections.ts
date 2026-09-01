import type { CompactionPolicyState, PluginProvenance, TokenUsage } from "./coreEvents";
import type { ParsedSessionEvent } from "./events";
import { SessionContractError } from "./errors";
import type { SessionHeader } from "./header";
import type {
  RequestId,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
} from "./identity";
import { validateSessionHistory } from "./invariants";
import type { JsonObject, JsonValue } from "./json";
import { foldSurface, type SurfaceFoldResult } from "./surface";

export interface SessionWindow {
  readonly header: SessionHeader;
  readonly events: readonly ParsedSessionEvent[];
  readonly revision: SessionRevision;
  readonly loadedRange: { readonly start: number; readonly end: number };
  readonly availability: { readonly earlier: boolean; readonly later: boolean };
  readonly fidelity: "full" | "adapter";
  readonly repair: {
    readonly state: "healthy" | "waiting-input" | "open-tail" | "repaired" | "corrupt";
    readonly message?: string;
    readonly repairedThroughSeq?: SessionSeq;
  };
}

export interface CanonicalChatProjectionMessage {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly eventSeq: SessionSeq;
  readonly role: "user" | "assistant" | "tool" | "compaction";
  readonly message: JsonValue;
  readonly sourceEventSeqs: readonly SessionSeq[];
}

export interface ChatProjection {
  readonly messages: readonly CanonicalChatProjectionMessage[];
}

export interface LiveAgentProjection {
  readonly status: "idle" | "running" | "awaiting-approval" | "retrying" | "compacting";
  readonly currentTurn?: number;
  readonly currentStep?: number;
  readonly accumulatedUsage: TokenUsage;
  readonly pendingApprovalIds: readonly string[];
  readonly unresolvedCallIds: readonly string[];
  readonly pendingRetryIds: readonly string[];
  readonly openCompactionIds: readonly string[];
}

export type TrajectoryRecordKind =
  | "session/header"
  | "session/metadata"
  | "turn"
  | "user/input"
  | "context/injected"
  | "request"
  | "assistant/response"
  | "tool"
  | "approval"
  | "retry"
  | "compaction"
  | "checkpoint"
  | "subagent"
  | "adapter/raw";

export interface TrajectoryRecord {
  readonly id: string;
  readonly kind: TrajectoryRecordKind | (string & {});
  readonly sourceSeqs: readonly SessionSeq[];
  readonly time: { readonly start: number; readonly end?: number };
  readonly status: "pending" | "running" | "completed" | "failed" | "cancelled" | "informational";
  readonly nesting: {
    readonly turn?: TurnId;
    readonly step?: StepId;
    readonly requestId?: RequestId;
    readonly callId?: ToolCallId;
  };
  readonly summary: string;
  readonly searchableText: string;
  readonly metrics?: JsonObject;
  readonly provenance?: PluginProvenance;
  readonly inspector: JsonValue;
}

export interface TrajectoryProjection {
  readonly records: readonly TrajectoryRecord[];
}

export interface TrajectoryProjectorContext {
  readonly header: SessionHeader;
  readonly event: ParsedSessionEvent;
  readonly defaultRecord: TrajectoryRecord;
}

export interface TrajectoryProjectorContribution {
  readonly id: string;
  readonly eventTypes: readonly string[];
  project(context: TrajectoryProjectorContext): readonly TrajectoryRecord[];
}

export interface CanonicalSessionProjection {
  readonly chat: ChatProjection;
  readonly live: LiveAgentProjection;
  readonly trajectory: TrajectoryProjection;
  readonly causal: SurfaceFoldResult;
}

export function projectCompactionPolicy(
  events: readonly ParsedSessionEvent[],
): CompactionPolicyState | undefined {
  const latest = [...events].reverse().find((event) => event.type === "compaction/policy");
  if (!latest) return undefined;
  const data = dataOf(latest);
  const health = data.health as CompactionPolicyState["health"];
  const completedTurns = events.filter((event) =>
    event.seq > latest.seq && event.type === "turn/end" &&
    (dataOf(event).reason as EventData | undefined)?.kind === "completed").length;
  return Object.freeze({
    declined: Boolean(data.declined),
    health: Object.freeze({
      ...health,
      turnsSinceCompact: health.turnsSinceCompact + completedTurns,
    }),
  });
}

export interface SessionQueryResult {
  readonly sessionId: SessionId;
  readonly eventSeq?: SessionSeq;
  readonly stableId: string;
  readonly summary: string;
  readonly matchedText: string;
  readonly score?: number;
  readonly lineage?: {
    readonly parentSessionId?: SessionId;
    readonly childSessionIds?: readonly SessionId[];
  };
}

export interface SessionQueryPage {
  readonly results: readonly SessionQueryResult[];
  readonly cursor?: string;
  readonly exhausted: boolean;
}

export interface SessionLineage {
  readonly sessionId: SessionId;
  readonly parent?: { readonly sessionId: SessionId; readonly boundarySeq: SessionSeq };
  readonly children: readonly {
    readonly sessionId: SessionId;
    readonly origin?: SessionHeader["origin"];
  }[];
}

export type ForkBoundaryIntent =
  | { readonly kind: "completed-turn"; readonly turn: number }
  | { readonly kind: "event"; readonly seq: SessionSeq }
  | { readonly kind: "surface-node"; readonly seq: SessionSeq };

export interface ForkSessionInput {
  readonly sessionId: SessionId;
  readonly boundary: ForkBoundaryIntent;
  readonly title?: string;
  readonly origin?: "fork" | "rerun" | "compaction";
}

export interface BoundaryResolutionResult {
  readonly requested: ForkBoundaryIntent;
  readonly resolvedSeq: SessionSeq;
  readonly seedLength: number;
  readonly structuralState: "balanced" | "repaired";
  readonly warning?: string;
}

export interface ForkSessionResult {
  readonly childSessionId: SessionId;
  readonly parentSessionId: SessionId;
  readonly boundary: BoundaryResolutionResult;
  readonly revision: SessionRevision;
}

type EventData = Record<string, unknown>;

function dataOf(event: ParsedSessionEvent): EventData {
  return event.data as EventData;
}

function stableEventId(header: SessionHeader, event: ParsedSessionEvent): string {
  return `${header.id}:event:${event.seq}`;
}

function sourceSeqsOf(event: ParsedSessionEvent): readonly SessionSeq[] {
  const envelope = event as ParsedSessionEvent & { readonly sourceEventSeqs?: readonly SessionSeq[] };
  return envelope.sourceEventSeqs ?? [];
}

export function projectChat(header: SessionHeader, surface: SurfaceFoldResult): ChatProjection {
  const messages = surface.currentEvents.map((event): CanonicalChatProjectionMessage => {
    const data = dataOf(event);
    switch (event.type) {
      case "user/message":
        return {
          id: stableEventId(header, event),
          sessionId: header.id,
          eventSeq: event.seq,
          role: "user",
          message: data.message as JsonValue,
          sourceEventSeqs: sourceSeqsOf(event),
        };
      case "assistant/message":
        return {
          id: stableEventId(header, event),
          sessionId: header.id,
          eventSeq: event.seq,
          role: "assistant",
          message: data.message as JsonValue,
          sourceEventSeqs: sourceSeqsOf(event),
        };
      case "tool/result":
        return {
          id: stableEventId(header, event),
          sessionId: header.id,
          eventSeq: event.seq,
          role: "tool",
          message: data.modelContent as JsonValue,
          sourceEventSeqs: sourceSeqsOf(event),
        };
      case "compaction/message":
        return {
          id: stableEventId(header, event),
          sessionId: header.id,
          eventSeq: event.seq,
          role: "compaction",
          message: data.content as JsonValue,
          sourceEventSeqs: sourceSeqsOf(event),
        };
      default:
        throw new SessionContractError({
          code: "INVALID_PROJECTION",
          message: `current surface event ${event.type} has no core Chat projector`,
          path: `events[${event.seq}]`,
        });
    }
  });
  return Object.freeze({ messages: Object.freeze(messages) });
}

function addUsage(total: Record<string, number>, usage: unknown): void {
  if (typeof usage !== "object" || usage === null || Array.isArray(usage)) return;
  for (const key of [
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "providerTotalTokens",
  ]) {
    const value = (usage as Record<string, unknown>)[key];
    if (typeof value === "number") total[key] = (total[key] ?? 0) + value;
  }
}

export function projectLiveAgent(events: readonly ParsedSessionEvent[]): LiveAgentProjection {
  const report = validateSessionHistory(events);
  const usage: Record<string, number> = {};
  for (const event of events) {
    if (event.type === "assistant/message") addUsage(usage, dataOf(event).usage);
  }
  const status =
    report.pendingApprovalIds.length > 0
      ? "awaiting-approval"
      : report.pendingRetryIds.length > 0
        ? "retrying"
        : report.openCompactionIds.length > 0
          ? "compacting"
          : report.openTurn !== undefined
            ? "running"
            : "idle";
  return Object.freeze({
    status,
    ...(report.openTurn === undefined ? {} : { currentTurn: report.openTurn }),
    ...(report.openStep === undefined ? {} : { currentStep: report.openStep }),
    accumulatedUsage: Object.freeze(usage) as TokenUsage,
    pendingApprovalIds: Object.freeze([...report.pendingApprovalIds]),
    unresolvedCallIds: Object.freeze([...report.unresolvedCallIds]),
    pendingRetryIds: Object.freeze([...report.pendingRetryIds]),
    openCompactionIds: Object.freeze([...report.openCompactionIds]),
  });
}

function trajectoryKind(type: string): TrajectoryRecordKind {
  if (type.startsWith("session/")) return "session/metadata";
  if (type.startsWith("turn/") || type.startsWith("step/")) return "turn";
  if (type === "user/message") return "user/input";
  if (type === "context/injected") return "context/injected";
  if (type.startsWith("request/")) return "request";
  if (type.startsWith("assistant/")) return "assistant/response";
  if (type.startsWith("tool/")) return "tool";
  if (type.startsWith("approval/")) return "approval";
  if (type.startsWith("retry/")) return "retry";
  if (type.startsWith("compaction/")) return "compaction";
  if (type === "workspace/checkpoint") return "checkpoint";
  if (type.startsWith("subagent/")) return "subagent";
  return "adapter/raw";
}

function trajectoryStatus(type: string, data: EventData): TrajectoryRecord["status"] {
  if (type.endsWith("/start") || type === "approval/request" || type === "retry/scheduled") return "running";
  if (type === "request/failure" || data.outcome === "failed") return "failed";
  if (data.outcome === "cancelled" || data.reason === "aborted") return "cancelled";
  if (type === "adapter/event" || type === "assistant/chunk") return "informational";
  return "completed";
}

function laterEvent(
  events: readonly ParsedSessionEvent[],
  event: ParsedSessionEvent,
  predicate: (candidate: ParsedSessionEvent, data: EventData) => boolean,
): ParsedSessionEvent | undefined {
  return events.find(
    (candidate) => candidate.seq > event.seq && predicate(candidate, dataOf(candidate)),
  );
}

function terminalEventFor(
  events: readonly ParsedSessionEvent[],
  event: ParsedSessionEvent,
): ParsedSessionEvent | undefined {
  const data = dataOf(event);
  switch (event.type) {
    case "turn/start":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "turn/end" && candidateData.turn === data.turn);
    case "step/start":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "step/end" && candidateData.step === data.step);
    case "request/header":
      return laterEvent(events, event, (candidate, candidateData) =>
        (candidate.type === "assistant/message" || candidate.type === "request/failure") &&
        candidateData.requestId === data.requestId);
    case "tool/call":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "tool/result" && candidateData.callId === data.callId);
    case "approval/request":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "approval/decision" &&
        candidateData.approvalId === data.approvalId);
    case "retry/scheduled":
      return laterEvent(events, event, (candidate, candidateData) =>
        (candidate.type === "retry/started" || candidate.type === "retry/cancelled") &&
        candidateData.retryId === data.retryId);
    case "compaction/start":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "compaction/end" &&
        candidateData.compactionId === data.compactionId);
    case "subagent/start":
      return laterEvent(events, event, (candidate, candidateData) =>
        candidate.type === "subagent/end" &&
        candidateData.childSessionId === data.childSessionId);
    default:
      return undefined;
  }
}

function completedStatus(
  event: ParsedSessionEvent,
  terminal: ParsedSessionEvent | undefined,
): TrajectoryRecord["status"] {
  if (!terminal) return trajectoryStatus(event.type, dataOf(event));
  const data = dataOf(terminal);
  if (terminal.type === "request/failure") return "failed";
  if (terminal.type === "tool/result") {
    return data.error === undefined ? "completed" : "failed";
  }
  if (terminal.type === "approval/decision") {
    if (data.outcome === "cancelled") return "cancelled";
    return data.outcome === "rejected" || data.outcome === "unavailable"
      ? "failed"
      : "completed";
  }
  if (terminal.type === "retry/cancelled") return "cancelled";
  if (terminal.type === "turn/end") {
    const reason = data.reason as EventData | undefined;
    if (reason?.kind === "aborted" || reason?.kind === "interrupted") return "cancelled";
    if (reason?.kind === "provider-error" || reason?.kind === "blocked") return "failed";
  }
  if (terminal.type === "step/end") {
    if (data.reason === "aborted" || data.reason === "interrupted") return "cancelled";
    if (data.reason === "provider-error") return "failed";
  }
  if (terminal.type === "compaction/end") {
    if (data.outcome === "cancelled" || data.outcome === "declined") return "cancelled";
    if (data.outcome === "failed") return "failed";
  }
  return "completed";
}

function terminalOutcome(terminal: ParsedSessionEvent | undefined): string | undefined {
  if (!terminal) return undefined;
  const data = dataOf(terminal);
  if (terminal.type === "turn/end") {
    const reason = data.reason as EventData | undefined;
    return typeof reason?.kind === "string" ? reason.kind : undefined;
  }
  for (const key of ["reason", "outcome"] as const) {
    if (typeof data[key] === "string") return data[key];
  }
  if (terminal.type === "request/failure") return "failed";
  if (terminal.type === "assistant/message") return String(data.finishReason ?? "completed");
  if (terminal.type === "tool/result") return data.error === undefined ? "completed" : "failed";
  if (terminal.type === "retry/started") return "started";
  return undefined;
}

function trajectorySummaryFor(
  event: ParsedSessionEvent,
  terminal: ParsedSessionEvent | undefined,
): string {
  const data = dataOf(event);
  const outcome = terminalOutcome(terminal);
  switch (event.type) {
    case "turn/start":
      return `Turn ${String(data.turn)}${outcome ? ` · ${outcome}` : ""}`;
    case "step/start":
      return `Step ${String(data.step)}${outcome ? ` · ${outcome}` : ""}`;
    case "request/header": {
      const request = data.header as EventData | undefined;
      return `${String(request?.selectedModelId ?? "Unknown model")} via ${String(request?.providerRoute ?? "unknown provider")}`;
    }
    case "tool/call":
      return String(data.name ?? data.callId ?? "Tool call");
    case "approval/request":
      return `Approval · ${String(data.callId ?? data.approvalId ?? "request")}`;
    case "retry/scheduled":
      return `Retry ${String(data.nextAttempt ?? "")} · ${String(data.delayMs ?? 0)}ms`;
    case "compaction/start":
      return `Compaction · ${String(data.trigger ?? "manual")}`;
    case "subagent/start":
      return `Subagent · ${String(data.childSessionId ?? "unknown")}`;
    case "user/message":
      return "User message";
    case "assistant/message":
      return `Assistant response · ${String(data.finishReason ?? "complete")}`;
    case "tool/result":
      return `Tool result · ${String(data.callId ?? "unknown")}`;
    default:
      return event.type;
  }
}

function recordForEvent(
  header: SessionHeader,
  event: ParsedSessionEvent,
  events: readonly ParsedSessionEvent[],
): TrajectoryRecord {
  const data = dataOf(event);
  const terminal = terminalEventFor(events, event);
  const terminalData = terminal ? dataOf(terminal) : undefined;
  const contributor =
    typeof data.contributor === "object" && data.contributor !== null
      ? (data.contributor as unknown as PluginProvenance)
      : undefined;
  const usage = terminalData?.usage ?? data.usage;
  const metrics =
    typeof usage === "object" && usage !== null
      ? (usage as JsonObject)
      : undefined;
  const performance = terminalData?.performance ?? data.performance;
  const timing = terminalData?.timing ?? data.timing;
  const performanceData = typeof performance === "object" && performance !== null
    ? performance as EventData
    : undefined;
  const timingData = typeof timing === "object" && timing !== null
    ? timing as EventData
    : undefined;
  const start = typeof timingData?.startedAt === "number"
    ? timingData.startedAt
    : typeof performanceData?.requestStartedAt === "number"
      ? performanceData.requestStartedAt
      : event.time;
  const end = typeof timingData?.endedAt === "number"
    ? timingData.endedAt
    : typeof performanceData?.endedAt === "number"
      ? performanceData.endedAt
      : terminal?.time;
  const sourceSeqs = terminal
    ? Object.freeze([event.seq, terminal.seq])
    : Object.freeze([event.seq]);
  const summary = trajectorySummaryFor(event, terminal);
  return Object.freeze({
    id: stableEventId(header, event),
    kind: trajectoryKind(event.type),
    sourceSeqs,
    time: Object.freeze({ start, ...(end === undefined ? {} : { end }) }),
    status: completedStatus(event, terminal),
    nesting: Object.freeze({
      ...(data.turn === undefined ? {} : { turn: data.turn as TurnId }),
      ...(data.step === undefined ? {} : { step: data.step as StepId }),
      ...(data.requestId === undefined ? {} : { requestId: data.requestId as RequestId }),
      ...(data.callId === undefined ? {} : { callId: data.callId as ToolCallId }),
    }),
    summary,
    searchableText: `${summary} ${event.type} ${JSON.stringify(event.data)} ${terminal ? JSON.stringify(terminal.data) : ""}`,
    ...(metrics === undefined ? {} : { metrics }),
    ...(contributor === undefined ? {} : { provenance: contributor }),
    inspector: event as unknown as JsonValue,
  });
}

export function projectTrajectory(
  header: SessionHeader,
  events: readonly ParsedSessionEvent[],
  projectors: readonly TrajectoryProjectorContribution[] = [],
): TrajectoryProjection {
  const records: TrajectoryRecord[] = [
    Object.freeze({
      id: `${header.id}:header`,
      kind: "session/header",
      sourceSeqs: Object.freeze([]),
      time: Object.freeze({ start: header.createdAt }),
      status: "completed",
      nesting: Object.freeze({}),
      summary: `session ${header.id}`,
      searchableText: `${header.id} ${header.backend} ${header.fidelity}`,
      inspector: header as unknown as JsonValue,
    }),
  ];
  for (const event of events) {
    const defaultRecord = recordForEvent(header, event, events);
    const matching = projectors.filter((projector) => projector.eventTypes.includes(event.type));
    if (matching.length === 0) records.push(defaultRecord);
    else {
      for (const projector of matching) {
        records.push(...projector.project({ header, event, defaultRecord }));
      }
    }
  }
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new SessionContractError({
        code: "INVALID_PROJECTION",
        message: `trajectory projector produced duplicate stable id ${record.id}`,
        path: "trajectory.records",
      });
    }
    ids.add(record.id);
  }
  return Object.freeze({ records: Object.freeze(records) });
}

export function projectCanonicalSession(
  header: SessionHeader,
  events: readonly ParsedSessionEvent[],
  projectors: readonly TrajectoryProjectorContribution[] = [],
): CanonicalSessionProjection {
  const causal = foldSurface(events);
  return Object.freeze({
    chat: projectChat(header, causal),
    live: projectLiveAgent(events),
    trajectory: projectTrajectory(header, events, projectors),
    causal,
  });
}
