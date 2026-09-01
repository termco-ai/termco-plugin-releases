import type { AppendSessionEvent, ParsedSessionEvent } from "./events";
import {
  ApprovalId,
  CompactionId,
  RequestId,
  RetryId,
  SessionId,
  StepId,
  ToolCallId,
  TurnId,
} from "./identity";
import { validateSessionHistory } from "./invariants";
import type { JsonValue } from "./json";

type Data = Record<string, unknown>;

function dataOf(event: ParsedSessionEvent): Data {
  return event.data as Data;
}

function object(value: unknown): Data | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Data
    : undefined;
}

function repairToolResult(
  call: { readonly turn: number; readonly step: number; readonly callId: string; readonly name: string },
  time: number,
  recovery: "not-started" | "outcome-unknown",
): AppendSessionEvent<"tool/result"> {
  const code = recovery === "not-started" ? "NOT_STARTED" : "OUTCOME_UNKNOWN";
  const message = recovery === "not-started"
    ? "The tool body did not start before the session was interrupted."
    : "The tool started, but its external outcome was not durably recorded. Verify external state before retrying.";
  const content = { recovery: code, message };
  return {
    type: "tool/result",
    time,
    data: {
      turn: TurnId(call.turn),
      step: StepId(call.step),
      callId: ToolCallId(call.callId),
      canonicalOutput: content,
      modelContent: {
        role: "tool",
        toolCallId: call.callId,
        toolName: call.name,
        content,
      },
      error: { name: "SessionRecovery", code, message },
      recovered: recovery,
    },
    surfaceOp: { op: "append" },
  };
}

interface RequestedToolCall {
  readonly turn: number;
  readonly step: number;
  readonly requestId: string;
  readonly callId: string;
  readonly name: string;
  readonly input: JsonValue;
}

function requestedCalls(
  events: readonly ParsedSessionEvent[],
  durableCallIds: ReadonlySet<string>,
  openTurn: number | undefined,
  openStep: number | undefined,
): RequestedToolCall[] {
  const requests = new Map<string, RequestedToolCall>();
  for (const event of events) {
    if (event.type !== "assistant/message") continue;
    const data = dataOf(event);
    if (Number(data.turn) !== openTurn || Number(data.step) !== openStep) continue;
    const message = object(data.message);
    if (!message || !Array.isArray(message.parts)) continue;
    for (const candidate of message.parts) {
      const part = object(candidate);
      if (!part || typeof part.toolCallId !== "string" || durableCallIds.has(part.toolCallId)) continue;
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) continue;
      if (part.state === "output-available" || part.state === "output-error") continue;
      const name = typeof part.toolName === "string" ? part.toolName : part.type.slice("tool-".length);
      if (!name) continue;
      requests.set(part.toolCallId, {
        turn: Number(data.turn),
        step: Number(data.step),
        requestId: String(data.requestId),
        callId: part.toolCallId,
        name,
        input: (part.input ?? null) as JsonValue,
      });
    }
  }
  return [...requests.values()];
}

/**
 * Produces the only current-format repair allowed by the contract: deterministic
 * append intents that close a structurally valid, interrupted tail. It never
 * drops or rewrites a committed event.
 */
export function planSessionTailRepair(
  events: readonly ParsedSessionEvent[],
): readonly AppendSessionEvent[] {
  const report = validateSessionHistory(events);
  if (report.suspension !== undefined) return [];
  const open =
    report.openTurn !== undefined ||
    report.openStep !== undefined ||
    report.unresolvedCallIds.length > 0 ||
    report.pendingApprovalIds.length > 0 ||
    report.pendingRetryIds.length > 0 ||
    report.openCompactionIds.length > 0 ||
    report.openSubagentSessionIds.length > 0;
  if (!open) return [];

  const time = events.at(-1)?.time ?? 0;
  const durableCalls = new Map<string, { turn: number; step: number; callId: string; name: string }>();
  const completedCalls = new Set<string>();
  const approvals = new Map<string, string>();
  const approvalDecisions = new Set<string>();
  const retryStates = new Map<string, { requestId: string; state: "scheduled" | "started" | "closed" }>();
  const openCompactions = new Set<string>();
  const openSubagents = new Set<string>();
  const assistantMessages = new Set<string>();
  const chunks = new Map<string, { turn: number; step: number; deltas: string[] }>();

  for (const event of events) {
    const data = dataOf(event);
    switch (event.type) {
      case "tool/call":
        durableCalls.set(String(data.callId), {
          turn: Number(data.turn),
          step: Number(data.step),
          callId: String(data.callId),
          name: String(data.name),
        });
        break;
      case "tool/result":
        completedCalls.add(String(data.callId));
        break;
      case "approval/request":
        approvals.set(String(data.approvalId), String(data.callId));
        break;
      case "approval/decision":
        approvalDecisions.add(String(data.approvalId));
        break;
      case "retry/scheduled":
        retryStates.set(String(data.retryId), { requestId: String(data.requestId), state: "scheduled" });
        break;
      case "retry/started": {
        const retry = retryStates.get(String(data.retryId));
        if (retry) retry.state = "started";
        break;
      }
      case "retry/cancelled": {
        const retry = retryStates.get(String(data.retryId));
        if (retry) retry.state = "closed";
        break;
      }
      case "request/attempt":
        if (typeof data.retryId === "string") {
          const retry = retryStates.get(data.retryId);
          if (retry) retry.state = "closed";
        }
        break;
      case "compaction/start":
        openCompactions.add(String(data.compactionId));
        break;
      case "compaction/end":
        openCompactions.delete(String(data.compactionId));
        break;
      case "subagent/start":
        openSubagents.add(String(data.childSessionId));
        break;
      case "subagent/end":
        openSubagents.delete(String(data.childSessionId));
        break;
      case "assistant/message":
        assistantMessages.add(String(data.requestId));
        break;
      case "assistant/chunk": {
        if (Number(data.turn) !== report.openTurn || Number(data.step) !== report.openStep) break;
        const requestId = String(data.requestId);
        const pending = chunks.get(requestId) ?? {
          turn: Number(data.turn),
          step: Number(data.step),
          deltas: [],
        };
        const chunk = object(data.chunk);
        if (chunk?.kind === "text-delta" && typeof chunk.delta === "string") {
          pending.deltas.push(chunk.delta);
        }
        chunks.set(requestId, pending);
        break;
      }
    }
  }

  const repair: AppendSessionEvent[] = [];
  for (const [approvalId, callId] of approvals) {
    if (approvalDecisions.has(approvalId)) continue;
    repair.push({
      type: "approval/decision",
      time,
      data: {
        approvalId: ApprovalId(approvalId),
        callId: ToolCallId(callId),
        outcome: "cancelled",
        responder: "policy",
      },
    });
  }

  for (const [requestId, chunk] of chunks) {
    if (assistantMessages.has(requestId) || chunk.deltas.length === 0) continue;
    repair.push({
      type: "assistant/message",
      time,
      data: {
        turn: TurnId(chunk.turn),
        step: StepId(chunk.step),
        requestId: RequestId(requestId),
        message: {
          id: `repair:${requestId}`,
          role: "assistant",
          parts: [{ type: "text", text: chunk.deltas.join("") }],
        },
        finishReason: "interrupted",
        interrupted: true,
      },
      surfaceOp: { op: "append" },
    });
  }

  for (const request of requestedCalls(
    events,
    new Set(durableCalls.keys()),
    report.openTurn,
    report.openStep,
  )) {
    repair.push({
      type: "tool/call",
      time,
      data: {
        turn: TurnId(request.turn),
        step: StepId(request.step),
        requestId: RequestId(request.requestId),
        callId: ToolCallId(request.callId),
        name: request.name,
        rawArguments: JSON.stringify(request.input),
        parsedInput: request.input,
        contributor: { pluginId: "session-repair", contributionId: "not-started" },
        concurrency: "exclusive",
      },
    });
    repair.push(repairToolResult(request, time, "not-started"));
  }

  for (const callId of report.unresolvedCallIds) {
    const call = durableCalls.get(callId);
    if (call && !completedCalls.has(callId)) {
      repair.push(repairToolResult(call, time, "outcome-unknown"));
    }
  }

  for (const [retryId, retry] of retryStates) {
    if (retry.state === "closed") continue;
    repair.push({
      type: "retry/cancelled",
      time,
      data: {
        retryId: RetryId(retryId),
        reason: { kind: "session-interrupted", requestId: retry.requestId },
      },
    });
  }
  for (const compactionId of openCompactions) {
    repair.push({
      type: "compaction/end",
      time,
      data: { compactionId: CompactionId(compactionId), outcome: "cancelled" },
    });
  }
  for (const childSessionId of openSubagents) {
    repair.push({
      type: "subagent/end",
      time,
      data: { childSessionId: SessionId(childSessionId), outcome: "interrupted" },
    });
  }
  if (report.openStep !== undefined && report.openTurn !== undefined) {
    repair.push({
      type: "step/end",
      time,
      data: {
        turn: TurnId(report.openTurn),
        step: StepId(report.openStep),
        reason: "interrupted",
      },
    });
  }
  if (report.openTurn !== undefined) {
    repair.push({
      type: "turn/end",
      time,
      data: { turn: TurnId(report.openTurn), reason: { kind: "interrupted", repair: true } },
    });
  }
  return repair;
}
