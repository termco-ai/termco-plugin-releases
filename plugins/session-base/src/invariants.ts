import type { ParsedSessionEvent } from "./events";
import type { TurnSuspension } from "./coreEvents";
import { SessionContractError } from "./errors";
import type { SessionEventParseOptions } from "./validation";
import { parseSessionEvent } from "./validation";

interface RequestState {
  readonly turn: number;
  readonly step: number;
  lastAttempt: number;
}

interface ToolCallState {
  readonly turn: number;
  readonly step: number;
  approvalId?: string;
  approvalDecided: boolean;
  result: boolean;
}

interface RetryState {
  readonly requestId: string;
  readonly nextAttempt: number;
  state: "scheduled" | "started" | "consumed" | "cancelled";
}

export interface SessionInvariantCompanionContext {
  readonly event: ParsedSessionEvent;
  readonly eventIndex: number;
  readonly events: readonly ParsedSessionEvent[];
}

export interface SessionHistoryValidationOptions extends SessionEventParseOptions {
  readonly invariantCompanions?: readonly ((context: SessionInvariantCompanionContext) => void)[];
}

export interface SessionHistoryValidationReport {
  readonly eventCount: number;
  readonly lastSeq: number;
  readonly openTurn?: number;
  readonly openStep?: number;
  readonly unresolvedCallIds: readonly string[];
  readonly pendingApprovalIds: readonly string[];
  readonly pendingRetryIds: readonly string[];
  readonly openCompactionIds: readonly string[];
  readonly openSubagentSessionIds: readonly string[];
  readonly repairedThroughSeq?: number;
  readonly suspension?: TurnSuspension;
}

export interface IncrementalSessionHistoryValidator {
  append(input: readonly unknown[]): void;
  report(): SessionHistoryValidationReport;
}

type EventData = Record<string, unknown>;

function dataOf(event: ParsedSessionEvent): EventData {
  return event.data as EventData;
}

function invariant(event: ParsedSessionEvent, rule: string, message: string, suffix = ""): never {
  const seq = event.seq as number;
  throw new SessionContractError({
    code: "INVARIANT_VIOLATION",
    message: `seq ${seq} (${event.type}) violates ${rule}: ${message}`,
    path: `events[${seq}]${suffix}`,
  });
}

function id(value: unknown): string {
  return value as string;
}

function numeric(value: unknown): number {
  return value as number;
}

/**
 * Validates cross-event structure without requiring a closed tail. Open state is
 * returned so cold-load recovery can distinguish safe tails from corruption.
 */
export function createSessionHistoryValidator(
  options: SessionHistoryValidationOptions = {},
): IncrementalSessionHistoryValidator {
  const events: ParsedSessionEvent[] = [];
  let openTurn: number | undefined;
  let openStep: number | undefined;
  let lastTurn = 0;
  let lastStep = 0;
  const requests = new Map<string, RequestState>();
  const calls = new Map<string, ToolCallState>();
  const approvals = new Map<string, string>();
  const retries = new Map<string, RetryState>();
  const unresolvedCalls = new Set<string>();
  const pendingApprovals = new Set<string>();
  const pendingRetries = new Set<string>();
  const compactions = new Map<string, "started" | "summarized" | "surfaced">();
  const subagents = new Set<string>();
  let suspension: TurnSuspension | undefined;
  let repairedThroughSeq: number | undefined;

  const report = (): SessionHistoryValidationReport => ({
    eventCount: events.length,
    lastSeq: events.length - 1,
    ...(openTurn === undefined ? {} : { openTurn }),
    ...(openStep === undefined ? {} : { openStep }),
    unresolvedCallIds: [...unresolvedCalls],
    pendingApprovalIds: [...pendingApprovals],
    pendingRetryIds: [...pendingRetries],
    openCompactionIds: [...compactions.keys()],
    openSubagentSessionIds: [...subagents],
    ...(repairedThroughSeq === undefined ? {} : { repairedThroughSeq }),
    ...(suspension === undefined ? {} : { suspension }),
  });

  const append = (input: readonly unknown[]): void => {
    const appended = input.map((event) => parseSessionEvent(event, options));
    const previousEventCount = events.length;
    const previous = {
      openTurn,
      openStep,
      lastTurn,
      lastStep,
      suspension,
      repairedThroughSeq,
    };
    const requestUndo = new Map<string, RequestState | undefined>();
    const callUndo = new Map<string, ToolCallState | undefined>();
    const approvalUndo = new Map<string, string | undefined>();
    const retryUndo = new Map<string, RetryState | undefined>();
    const unresolvedCallUndo = new Map<string, boolean>();
    const pendingApprovalUndo = new Map<string, boolean>();
    const pendingRetryUndo = new Map<string, boolean>();
    const compactionUndo = new Map<string, "started" | "summarized" | "surfaced" | undefined>();
    const subagentUndo = new Map<string, boolean>();
    const remember = <T>(map: Map<string, T>, undo: Map<string, T | undefined>, key: string): void => {
      if (!undo.has(key)) undo.set(key, map.get(key));
    };
    const rememberObject = <T extends object>(
      map: Map<string, T>,
      undo: Map<string, T | undefined>,
      key: string,
    ): void => {
      if (!undo.has(key)) {
        const value = map.get(key);
        undo.set(key, value === undefined ? undefined : { ...value });
      }
    };
    const rememberSubagent = (key: string): void => {
      if (!subagentUndo.has(key)) subagentUndo.set(key, subagents.has(key));
    };
    const rememberSet = (set: Set<string>, undo: Map<string, boolean>, key: string): void => {
      if (!undo.has(key)) undo.set(key, set.has(key));
    };
    events.push(...appended);

    try {
      for (const [offset, event] of appended.entries()) {
        const index = previousEventCount + offset;
    if ((event.seq as number) !== index) {
      invariant(event, "contiguous-sequence", `expected sequence ${index}`, ".seq");
    }

    const data = dataOf(event);
    switch (event.type) {
      case "turn/start": {
        const turn = numeric(data.turn);
        if (openTurn !== undefined) invariant(event, "single-open-turn", `turn ${openTurn} is still open`);
        if (turn <= lastTurn) invariant(event, "monotonic-turn-id", `turn ${turn} does not exceed ${lastTurn}`, ".data.turn");
        openTurn = turn;
        lastTurn = turn;
        break;
      }
      case "turn/suspend": {
        const turn = numeric(data.turn);
        const step = numeric(data.step);
        if (openTurn !== turn || openStep !== step) {
          invariant(event, "suspension-inside-step", `turn ${turn}, step ${step} is not open`);
        }
        if (suspension !== undefined) {
          invariant(event, "single-suspension", `turn ${suspension.turn}, step ${suspension.step} is already suspended`);
        }
        const callIds = [...data.callIds as readonly string[]];
        const approvalIds = [...data.approvalIds as readonly string[]];
        if (new Set(callIds).size !== callIds.length) {
          invariant(event, "unique-suspended-calls", "suspended call ids cannot repeat", ".data.callIds");
        }
        if (new Set(approvalIds).size !== approvalIds.length) {
          invariant(event, "unique-suspended-approvals", "suspended approval ids cannot repeat", ".data.approvalIds");
        }
        const unresolved = [...unresolvedCalls]
          .filter((callId) => {
            const call = calls.get(callId);
            return call?.turn === turn && call.step === step;
          })
          .sort();
        const pending = [...pendingApprovals]
          .filter((approvalId) => {
            const callId = approvals.get(approvalId);
            if (callId === undefined) return false;
            const call = calls.get(callId);
            return call?.turn === turn && call.step === step;
          })
          .sort();
        if (JSON.stringify([...callIds].sort()) !== JSON.stringify(unresolved)) {
          invariant(event, "suspension-call-set", "suspension must own every unresolved call in the open step", ".data.callIds");
        }
        if (JSON.stringify([...approvalIds].sort()) !== JSON.stringify(pending)) {
          invariant(event, "suspension-approval-set", "suspension must own every pending approval in the open step", ".data.approvalIds");
        }
        suspension = {
          turn: data.turn as TurnSuspension["turn"],
          step: data.step as TurnSuspension["step"],
          reason: "human-input",
          callIds: callIds as unknown as TurnSuspension["callIds"],
          approvalIds: approvalIds as unknown as TurnSuspension["approvalIds"],
        };
        break;
      }
      case "turn/resume": {
        const turn = numeric(data.turn);
        const step = numeric(data.step);
        if (openTurn !== turn || openStep !== step || suspension === undefined) {
          invariant(event, "resume-suspended-turn", `turn ${turn}, step ${step} is not suspended`);
        }
        const unresolved = suspension.callIds.find((callId) => {
          const call = calls.get(String(callId));
          if (!call || call.result) return false;
          // An executable tool resumes after the human decides its approval;
          // the resumed request then produces the canonical tool result.
          return call.approvalId === undefined || !call.approvalDecided;
        });
        if (unresolved !== undefined) {
          invariant(event, "resolve-before-resume", `call ${unresolved} has no result`);
        }
        const pending = suspension.approvalIds.find((approvalId) => {
          const callId = approvals.get(String(approvalId));
          return callId !== undefined && !calls.get(callId)?.approvalDecided;
        });
        if (pending !== undefined) {
          invariant(event, "approval-before-resume", `approval ${pending} has no decision`);
        }
        suspension = undefined;
        break;
      }
      case "turn/end": {
        const turn = numeric(data.turn);
        if (openTurn !== turn) invariant(event, "turn-balance", `turn ${turn} is not the open turn`, ".data.turn");
        if (suspension !== undefined) invariant(event, "resume-before-turn-end", `turn ${turn} is suspended`);
        if (openStep !== undefined) invariant(event, "step-before-turn-end", `step ${openStep} is still open`);
        const unresolvedCall = [...unresolvedCalls].find((callId) => calls.get(callId)?.turn === turn);
        if (unresolvedCall) invariant(event, "tool-call-balance", `call ${unresolvedCall} has no result`);
        const pendingRetry = pendingRetries.values().next().value;
        if (pendingRetry) invariant(event, "retry-balance", `retry ${pendingRetry} is still scheduled`);
        openTurn = undefined;
        break;
      }
      case "step/start": {
        const turn = numeric(data.turn);
        const step = numeric(data.step);
        if (openTurn !== turn) invariant(event, "step-inside-turn", `turn ${turn} is not open`, ".data.turn");
        if (openStep !== undefined) invariant(event, "single-open-step", `step ${openStep} is still open`);
        if (step <= lastStep) invariant(event, "global-monotonic-step-id", `step ${step} does not exceed ${lastStep}`, ".data.step");
        openStep = step;
        lastStep = step;
        break;
      }
      case "step/end": {
        const turn = numeric(data.turn);
        const step = numeric(data.step);
        if (openTurn !== turn || openStep !== step) invariant(event, "step-balance", `turn ${turn}, step ${step} is not open`);
        if (suspension !== undefined) invariant(event, "resume-before-step-end", `turn ${turn}, step ${step} is suspended`);
        const unresolvedCall = [...unresolvedCalls].find((callId) => calls.get(callId)?.step === step);
        if (unresolvedCall) invariant(event, "tool-call-before-step-end", `call ${unresolvedCall} has no result`);
        openStep = undefined;
        break;
      }
      case "user/message":
        if (openTurn !== numeric(data.turn)) invariant(event, "input-inside-turn", `turn ${String(data.turn)} is not open`);
        break;
      case "context/injected":
        if (openTurn !== numeric(data.turn) || openStep !== numeric(data.step)) invariant(event, "context-inside-step", "context does not belong to the open turn and step");
        break;
      case "request/header": {
        const turn = numeric(data.turn);
        const step = numeric(data.step);
        const requestId = id(data.requestId);
        if (openTurn !== turn || openStep !== step) invariant(event, "request-inside-step", "request does not belong to the open turn and step");
        if (requests.has(requestId)) invariant(event, "unique-request-id", `request ${requestId} already exists`, ".data.requestId");
        rememberObject(requests, requestUndo, requestId);
        requests.set(requestId, { turn, step, lastAttempt: 0 });
        break;
      }
      case "request/context": {
        const requestId = id(data.requestId);
        if (!requests.has(requestId)) invariant(event, "request-context-reference", `request ${requestId} does not exist`, ".data.requestId");
        break;
      }
      case "request/attempt": {
        const requestId = id(data.requestId);
        const request = requests.get(requestId);
        if (!request) invariant(event, "request-attempt-reference", `request ${requestId} does not exist`, ".data.requestId");
        const attempt = numeric(data.attempt);
        if (attempt !== request.lastAttempt + 1) invariant(event, "monotonic-request-attempt", `expected attempt ${request.lastAttempt + 1}`, ".data.attempt");
        if (data.retryId !== undefined) {
          const retry = retries.get(id(data.retryId));
          if (!retry || retry.state !== "started" || retry.requestId !== requestId || retry.nextAttempt !== attempt) {
            invariant(event, "attempt-retry-reference", `retry ${String(data.retryId)} is not the matching started retry`, ".data.retryId");
          }
          rememberObject(retries, retryUndo, id(data.retryId));
          retry.state = "consumed";
          rememberSet(pendingRetries, pendingRetryUndo, id(data.retryId));
          pendingRetries.delete(id(data.retryId));
        } else if (attempt !== 1) {
          invariant(event, "retry-required", "attempts after the first must cite a started retry", ".data.retryId");
        }
        rememberObject(requests, requestUndo, requestId);
        request.lastAttempt = attempt;
        break;
      }
      case "request/failure": {
        const request = requests.get(id(data.requestId));
        if (!request) invariant(event, "request-failure-reference", `request ${String(data.requestId)} does not exist`, ".data.requestId");
        if (numeric(data.attempt) !== request.lastAttempt) invariant(event, "failure-attempt-reference", "failure does not cite the latest attempt", ".data.attempt");
        break;
      }
      case "assistant/chunk":
      case "assistant/message": {
        const request = requests.get(id(data.requestId));
        if (!request) invariant(event, "assistant-request-reference", `request ${String(data.requestId)} does not exist`, ".data.requestId");
        if (request.turn !== numeric(data.turn) || request.step !== numeric(data.step)) invariant(event, "assistant-request-owner", "assistant output does not match its request turn and step");
        break;
      }
      case "tool/call": {
        const callId = id(data.callId);
        const request = requests.get(id(data.requestId));
        if (!request) invariant(event, "tool-request-reference", `request ${String(data.requestId)} does not exist`, ".data.requestId");
        if (request.turn !== numeric(data.turn) || request.step !== numeric(data.step) || openTurn !== request.turn || openStep !== request.step) invariant(event, "tool-inside-request-step", "tool call does not match the open request turn and step");
        if (calls.has(callId)) invariant(event, "unique-tool-call", `call ${callId} already exists`, ".data.callId");
        rememberObject(calls, callUndo, callId);
        calls.set(callId, { turn: request.turn, step: request.step, approvalDecided: false, result: false });
        rememberSet(unresolvedCalls, unresolvedCallUndo, callId);
        unresolvedCalls.add(callId);
        break;
      }
      case "approval/request": {
        const approvalId = id(data.approvalId);
        const callId = id(data.callId);
        const call = calls.get(callId);
        if (!call) invariant(event, "approval-call-reference", `call ${callId} does not exist`, ".data.callId");
        if (approvals.has(approvalId) || call.approvalId !== undefined) invariant(event, "single-approval-request", `call ${callId} already has an approval request`);
        remember(approvals, approvalUndo, approvalId);
        rememberObject(calls, callUndo, callId);
        approvals.set(approvalId, callId);
        call.approvalId = approvalId;
        rememberSet(pendingApprovals, pendingApprovalUndo, approvalId);
        pendingApprovals.add(approvalId);
        break;
      }
      case "approval/decision": {
        const approvalId = id(data.approvalId);
        const callId = id(data.callId);
        const expectedCallId = approvals.get(approvalId);
        const call = calls.get(callId);
        if (expectedCallId !== callId || !call) invariant(event, "approval-decision-reference", `approval ${approvalId} does not belong to call ${callId}`);
        if (call.approvalDecided) invariant(event, "single-approval-decision", `approval ${approvalId} is already closed`);
        rememberObject(calls, callUndo, callId);
        call.approvalDecided = true;
        rememberSet(pendingApprovals, pendingApprovalUndo, approvalId);
        pendingApprovals.delete(approvalId);
        break;
      }
      case "tool/result": {
        const callId = id(data.callId);
        const call = calls.get(callId);
        if (!call) invariant(event, "tool-result-reference", `call ${callId} does not exist`, ".data.callId");
        if (call.result) invariant(event, "single-tool-result", `call ${callId} already has a result`);
        if (call.turn !== numeric(data.turn) || call.step !== numeric(data.step)) invariant(event, "tool-result-owner", "tool result does not match its call turn and step");
        if (call.approvalId !== undefined && !call.approvalDecided) invariant(event, "approval-before-result", `approval ${call.approvalId} is unresolved`);
        rememberObject(calls, callUndo, callId);
        call.result = true;
        rememberSet(unresolvedCalls, unresolvedCallUndo, callId);
        unresolvedCalls.delete(callId);
        break;
      }
      case "retry/scheduled": {
        const retryId = id(data.retryId);
        const requestId = id(data.requestId);
        const request = requests.get(requestId);
        if (!request) invariant(event, "retry-request-reference", `request ${requestId} does not exist`, ".data.requestId");
        const previous = numeric(data.previousAttempt);
        const next = numeric(data.nextAttempt);
        if (previous !== request.lastAttempt || next !== previous + 1) invariant(event, "retry-attempt-sequence", `retry must advance attempt ${request.lastAttempt} by exactly one`);
        if (retries.has(retryId)) invariant(event, "unique-retry-id", `retry ${retryId} already exists`, ".data.retryId");
        rememberObject(retries, retryUndo, retryId);
        retries.set(retryId, { requestId, nextAttempt: next, state: "scheduled" });
        rememberSet(pendingRetries, pendingRetryUndo, retryId);
        pendingRetries.add(retryId);
        break;
      }
      case "retry/started": {
        const retryId = id(data.retryId);
        const retry = retries.get(retryId);
        if (!retry || retry.state !== "scheduled") invariant(event, "retry-start-reference", `retry ${retryId} is not scheduled`, ".data.retryId");
        if (retry.requestId !== id(data.requestId) || retry.nextAttempt !== numeric(data.attempt)) invariant(event, "retry-start-match", `retry ${retryId} does not match request and attempt`);
        rememberObject(retries, retryUndo, retryId);
        retry.state = "started";
        break;
      }
      case "retry/cancelled": {
        const retryId = id(data.retryId);
        const retry = retries.get(retryId);
        if (!retry || (retry.state !== "scheduled" && retry.state !== "started")) invariant(event, "retry-cancel-reference", `retry ${retryId} is not pending`, ".data.retryId");
        rememberObject(retries, retryUndo, retryId);
        retry.state = "cancelled";
        rememberSet(pendingRetries, pendingRetryUndo, retryId);
        pendingRetries.delete(retryId);
        break;
      }
      case "compaction/start": {
        const compactionId = id(data.compactionId);
        if (compactions.has(compactionId)) invariant(event, "unique-compaction-id", `compaction ${compactionId} already exists`);
        const candidate = data.candidate as EventData;
        if (numeric(candidate.end) >= (event.seq as number)) invariant(event, "compaction-candidate-causality", "candidate range must precede compaction start", ".data.candidate.end");
        remember(compactions, compactionUndo, compactionId);
        compactions.set(compactionId, "started");
        break;
      }
      case "compaction/summary": {
        const compactionId = id(data.compactionId);
        if (compactions.get(compactionId) !== "started") invariant(event, "compaction-summary-reference", `compaction ${compactionId} is not open`);
        remember(compactions, compactionUndo, compactionId);
        compactions.set(compactionId, "summarized");
        break;
      }
      case "compaction/message": {
        const compactionId = id(data.compactionId);
        if (compactions.get(compactionId) !== "summarized") invariant(event, "compaction-surface-reference", `compaction ${compactionId} has no summary`);
        remember(compactions, compactionUndo, compactionId);
        compactions.set(compactionId, "surfaced");
        break;
      }
      case "compaction/end": {
        const compactionId = id(data.compactionId);
        const state = compactions.get(compactionId);
        if (!state) invariant(event, "compaction-end-reference", `compaction ${compactionId} is not open`);
        if (data.outcome === "succeeded" && state !== "surfaced") invariant(event, "successful-compaction-surface", `compaction ${compactionId} has no replacement surface message`);
        remember(compactions, compactionUndo, compactionId);
        compactions.delete(compactionId);
        break;
      }
      case "subagent/start": {
        const child = id(data.childSessionId);
        if (subagents.has(child)) invariant(event, "unique-open-subagent", `child ${child} is already open`);
        rememberSubagent(child);
        subagents.add(child);
        break;
      }
      case "subagent/report":
        if (!subagents.has(id(data.childSessionId))) invariant(event, "subagent-report-reference", `child ${String(data.childSessionId)} is not open`);
        break;
      case "subagent/end": {
        const child = id(data.childSessionId);
        rememberSubagent(child);
        if (!subagents.delete(child)) invariant(event, "subagent-end-reference", `child ${String(data.childSessionId)} is not open`);
        break;
      }
      default:
        break;
    }

    if (event.type === "tool/result" && data.recovered !== undefined) {
      repairedThroughSeq = event.seq as number;
    } else if (event.type === "turn/end") {
      const reason = data.reason;
      if (typeof reason === "object" && reason !== null &&
          (reason as EventData).kind === "interrupted" &&
          (reason as EventData).repair === true) {
        repairedThroughSeq = event.seq as number;
      }
    }

    for (const companion of options.invariantCompanions ?? []) {
      try {
        companion({ event, eventIndex: index, events });
      } catch (error) {
        if (error instanceof SessionContractError) throw error;
        invariant(event, "plugin-invariant-companion", error instanceof Error ? error.message : String(error));
      }
    }
      }
    } catch (error) {
      openTurn = previous.openTurn;
      openStep = previous.openStep;
      lastTurn = previous.lastTurn;
      lastStep = previous.lastStep;
      suspension = previous.suspension;
      repairedThroughSeq = previous.repairedThroughSeq;
      events.splice(previousEventCount);
      for (const [key, value] of requestUndo) value === undefined ? requests.delete(key) : requests.set(key, value);
      for (const [key, value] of callUndo) value === undefined ? calls.delete(key) : calls.set(key, value);
      for (const [key, value] of approvalUndo) value === undefined ? approvals.delete(key) : approvals.set(key, value);
      for (const [key, value] of retryUndo) value === undefined ? retries.delete(key) : retries.set(key, value);
      for (const [key, existed] of unresolvedCallUndo) existed ? unresolvedCalls.add(key) : unresolvedCalls.delete(key);
      for (const [key, existed] of pendingApprovalUndo) existed ? pendingApprovals.add(key) : pendingApprovals.delete(key);
      for (const [key, existed] of pendingRetryUndo) existed ? pendingRetries.add(key) : pendingRetries.delete(key);
      for (const [key, value] of compactionUndo) value === undefined ? compactions.delete(key) : compactions.set(key, value);
      for (const [key, existed] of subagentUndo) existed ? subagents.add(key) : subagents.delete(key);
      throw error;
    }
  };

  return {
    append,
    report,
  };
}

/**
 * Validates a complete current-format history in one pass.
 */
export function validateSessionHistory(
  input: readonly unknown[],
  options: SessionHistoryValidationOptions = {},
): SessionHistoryValidationReport {
  const validator = createSessionHistoryValidator(options);
  validator.append(input);
  return validator.report();
}
