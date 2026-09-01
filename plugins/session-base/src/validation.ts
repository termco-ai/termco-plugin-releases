import "./coreEvents";

import type { AppendSessionEvent, ParsedSessionEvent } from "./events";
import { SessionContractError, type SessionContractErrorCode } from "./errors";
import type { SessionHeader } from "./header";
import { SessionId, SessionSeq } from "./identity";
import type { JsonValue } from "./json";
import { SESSION_FORMAT_VERSION } from "./version";

type UnknownObject = Record<string, unknown>;

export type SessionEventDataValidator = (data: unknown, path: string) => void;

export interface SessionEventRuntimeExtension {
  readonly validateData: SessionEventDataValidator;
  readonly surface?: boolean;
}

export interface SessionEventParseOptions {
  readonly extensions?: Readonly<Record<string, SessionEventRuntimeExtension>>;
}

export const CORE_SESSION_EVENT_TYPES = [
  "session/end-seed",
  "session/title",
  "session/policy",
  "session/pin",
  "session/label",
  "session/rig",
  "turn/start",
  "turn/suspend",
  "turn/resume",
  "turn/end",
  "step/start",
  "step/end",
  "user/message",
  "context/injected",
  "request/header",
  "request/context",
  "request/attempt",
  "request/failure",
  "assistant/chunk",
  "assistant/message",
  "tool/call",
  "approval/request",
  "approval/decision",
  "tool/result",
  "retry/scheduled",
  "retry/started",
  "retry/cancelled",
  "compaction/start",
  "compaction/summary",
  "compaction/message",
  "compaction/end",
  "compaction/policy",
  "workspace/checkpoint",
  "subagent/start",
  "subagent/report",
  "subagent/end",
  "adapter/event",
] as const;

const coreTypes = new Set<string>(CORE_SESSION_EVENT_TYPES);
const coreSurfaceTypes = new Set<string>([
  "user/message",
  "assistant/message",
  "tool/result",
  "compaction/message",
]);

function fail(code: SessionContractErrorCode, message: string, path: string, cause?: unknown): never {
  throw new SessionContractError({ code, message, path, cause });
}

function objectValue(
  value: unknown,
  path: string,
  code: SessionContractErrorCode = "INVALID_EVENT",
): UnknownObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(code, `${path} must be an object`, path);
  }
  return value as UnknownObject;
}

function exactKeys(
  value: UnknownObject,
  allowed: readonly string[],
  path: string,
  code: SessionContractErrorCode = "INVALID_EVENT",
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected !== undefined) {
    fail(code, `${path}.${unexpected} is not part of the current contract`, `${path}.${unexpected}`);
  }
}

function stringValue(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    fail("INVALID_EVENT", `${path} must be ${allowEmpty ? "a string" : "a non-empty string"}`, path);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail("INVALID_EVENT", `${path} must be a boolean`, path);
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    fail("INVALID_EVENT", `${path} must be a finite JSON number`, path);
  }
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  const result = finiteNumber(value, path);
  if (!Number.isSafeInteger(result) || result < minimum) {
    fail("INVALID_EVENT", `${path} must be a safe integer >= ${minimum}`, path);
  }
  return result;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], path: string): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    fail("INVALID_EVENT", `${path} must be one of: ${values.join(", ")}`, path);
  }
  return value as T;
}

function optionalString(value: unknown, path: string): void {
  if (value !== undefined) stringValue(value, path);
}

function optionalNumber(value: unknown, path: string, integerOnly = false): void {
  if (value !== undefined) (integerOnly ? integer(value, path) : finiteNumber(value, path));
}

/** Reject every value that cannot survive a JSON stringify/parse round trip exactly. */
export function assertLosslessJson(value: unknown, path = "value"): asserts value is JsonValue {
  const ancestors = new Set<object>();

  const visit = (candidate: unknown, candidatePath: string): void => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean"
    ) {
      return;
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        fail("INVALID_JSON", `${candidatePath} is not a lossless JSON number`, candidatePath);
      }
      return;
    }
    if (typeof candidate !== "object") {
      fail("INVALID_JSON", `${candidatePath} contains ${typeof candidate}, which JSON cannot preserve`, candidatePath);
    }

    const object = candidate as object;
    if (ancestors.has(object)) fail("INVALID_JSON", `${candidatePath} contains a cycle`, candidatePath);
    ancestors.add(object);

    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        if (!(index in candidate)) fail("INVALID_JSON", `${candidatePath}[${index}] is an array hole`, `${candidatePath}[${index}]`);
        visit(candidate[index], `${candidatePath}[${index}]`);
      }
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        fail("INVALID_JSON", `${candidatePath} must be a plain JSON object`, candidatePath);
      }
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") fail("INVALID_JSON", `${candidatePath} has a symbol key`, candidatePath);
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key)!;
        if (!descriptor.enumerable || !("value" in descriptor)) {
          fail("INVALID_JSON", `${candidatePath}.${key} is not a plain enumerable value`, `${candidatePath}.${key}`);
        }
        visit(descriptor.value, `${candidatePath}.${key}`);
      }
    }

    ancestors.delete(object);
  };

  visit(value, path);
}

function jsonObject(value: unknown, path: string): UnknownObject {
  const object = objectValue(value, path);
  assertLosslessJson(object, path);
  return object;
}

function contributor(value: unknown, path: string): void {
  const object = jsonObject(value, path);
  if (object.fidelity !== undefined) oneOf(object.fidelity, ["full", "adapter"], `${path}.fidelity`);
  stringValue(object.pluginId, `${path}.pluginId`);
  optionalString(object.revision, `${path}.revision`);
  optionalString(object.contributionId, `${path}.contributionId`);
}

function structuredFailure(value: unknown, path: string): void {
  const object = jsonObject(value, path);
  stringValue(object.name, `${path}.name`);
  stringValue(object.code, `${path}.code`);
  stringValue(object.message, `${path}.message`, true);
}

function tokenUsage(value: unknown, path: string): void {
  const object = jsonObject(value, path);
  for (const key of [
    "inputTokens",
    "outputTokens",
    "reasoningTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "providerTotalTokens",
  ]) {
    optionalNumber(object[key], `${path}.${key}`, true);
  }
  if (object.estimated !== undefined) booleanValue(object.estimated, `${path}.estimated`);
}

function requestHeader(value: unknown, path: string): void {
  const object = jsonObject(value, path);
  stringValue(object.selectedModelId, `${path}.selectedModelId`);
  stringValue(object.providerRoute, `${path}.providerRoute`);
  stringValue(object.providerModelId, `${path}.providerModelId`);
  stringValue(object.systemPrompt, `${path}.systemPrompt`, true);
  if (!Array.isArray(object.messages)) fail("INVALID_EVENT", `${path}.messages must be an array`, `${path}.messages`);
  if (!Array.isArray(object.tools)) fail("INVALID_EVENT", `${path}.tools must be an array`, `${path}.tools`);
  object.tools.forEach((tool, index) => {
    const descriptor = jsonObject(tool, `${path}.tools[${index}]`);
    stringValue(descriptor.name, `${path}.tools[${index}].name`);
    jsonObject(descriptor.schema, `${path}.tools[${index}].schema`);
    contributor(descriptor.contributor, `${path}.tools[${index}].contributor`);
  });
  if (!Array.isArray(object.activeTools)) fail("INVALID_EVENT", `${path}.activeTools must be an array`, `${path}.activeTools`);
  for (const [index, name] of object.activeTools.entries()) stringValue(name, `${path}.activeTools[${index}]`);
  if (object.maxSteps === undefined) {
    if (object.fidelity !== "adapter") {
      fail("INVALID_EVENT", `${path}.maxSteps is required for full-fidelity requests`, `${path}.maxSteps`);
    }
  } else integer(object.maxSteps, `${path}.maxSteps`, 1);
  jsonObject(object.approvalPolicy, `${path}.approvalPolicy`);
  optionalString(object.reasoningEffort, `${path}.reasoningEffort`);
  if (object.maxOutputTokens !== undefined) integer(object.maxOutputTokens, `${path}.maxOutputTokens`, 1);
  if (object.topK !== undefined) integer(object.topK, `${path}.topK`, 1);
  if (object.seed !== undefined) integer(object.seed, `${path}.seed`);
  if (object.chunkTimeoutMs !== undefined) integer(object.chunkTimeoutMs, `${path}.chunkTimeoutMs`, 1);
  if (object.totalTimeoutMs !== undefined) integer(object.totalTimeoutMs, `${path}.totalTimeoutMs`, 1);
  for (const key of ["temperature", "topP"]) optionalNumber(object[key], `${path}.${key}`);
  if (typeof object.temperature === "number" && object.temperature < 0) fail("INVALID_EVENT", `${path}.temperature must be non-negative`, `${path}.temperature`);
  if (typeof object.topP === "number" && (object.topP < 0 || object.topP > 1)) fail("INVALID_EVENT", `${path}.topP must be between 0 and 1`, `${path}.topP`);
  if (object.stop !== undefined) {
    if (!Array.isArray(object.stop)) fail("INVALID_EVENT", `${path}.stop must be an array`, `${path}.stop`);
    for (const [index, stop] of object.stop.entries()) stringValue(stop, `${path}.stop[${index}]`, true);
  }
  if (object.providerOptions !== undefined) jsonObject(object.providerOptions, `${path}.providerOptions`);
  if (object.provenance !== undefined) {
    if (!Array.isArray(object.provenance)) fail("INVALID_EVENT", `${path}.provenance must be an array`, `${path}.provenance`);
    object.provenance.forEach((item, index) => contributor(item, `${path}.provenance[${index}]`));
  }
  if (object.unknownControls !== undefined) {
    if (!Array.isArray(object.unknownControls)) fail("INVALID_EVENT", `${path}.unknownControls must be an array`, `${path}.unknownControls`);
    object.unknownControls.forEach((control, index) => stringValue(control, `${path}.unknownControls[${index}]`));
    if (object.fidelity !== "adapter") fail("INVALID_EVENT", `${path}.unknownControls requires adapter fidelity`, `${path}.unknownControls`);
  }
}

function validateSurface(event: UnknownObject, type: string, surface: boolean, seq: number): void {
  if (!surface) {
    if ("surfaceOp" in event || "sourceEventSeqs" in event) {
      fail("INVALID_EVENT", `${type} is not surface eligible`, "event.surfaceOp");
    }
    return;
  }

  const surfaceOp = objectValue(event.surfaceOp, "event.surfaceOp");
  const op = oneOf(surfaceOp.op, ["append", "replace"], "event.surfaceOp.op");
  if (op === "replace") {
    const start = integer(surfaceOp.start, "event.surfaceOp.start");
    const end = integer(surfaceOp.end, "event.surfaceOp.end");
    if (start > end) fail("INVALID_EVENT", "replacement start must not exceed end", "event.surfaceOp.start");
    if (end >= seq) fail("INVALID_EVENT", "replacement endpoints must precede the derived event", "event.surfaceOp.end");
  } else if ("start" in surfaceOp || "end" in surfaceOp) {
    fail("INVALID_EVENT", "append surface operation cannot carry replacement endpoints", "event.surfaceOp");
  }

  if (event.sourceEventSeqs !== undefined) {
    if (!Array.isArray(event.sourceEventSeqs)) {
      fail("INVALID_EVENT", "event.sourceEventSeqs must be an array", "event.sourceEventSeqs");
    }
    const seen = new Set<number>();
    event.sourceEventSeqs.forEach((source, index) => {
      const parsed = integer(source, `event.sourceEventSeqs[${index}]`);
      if (parsed >= seq) {
        fail("INVALID_EVENT", "source events must precede the derived event", `event.sourceEventSeqs[${index}]`);
      }
      if (seen.has(parsed)) fail("INVALID_EVENT", "source events cannot repeat", `event.sourceEventSeqs[${index}]`);
      seen.add(parsed);
    });
  }
}

function validateCoreData(type: string, value: unknown, path: string): void {
  const data = objectValue(value, path);

  switch (type) {
    case "session/end-seed":
      if (Object.keys(data).length > 0) fail("INVALID_EVENT", "session/end-seed data must be empty", path);
      break;
    case "session/title":
      stringValue(data.title, `${path}.title`);
      oneOf(data.source, ["system", "user", "model"], `${path}.source`);
      if (data.sourceEventSeqs !== undefined) {
        if (!Array.isArray(data.sourceEventSeqs)) fail("INVALID_EVENT", `${path}.sourceEventSeqs must be an array`, `${path}.sourceEventSeqs`);
        data.sourceEventSeqs.forEach((seq, index) => integer(seq, `${path}.sourceEventSeqs[${index}]`));
      }
      break;
    case "session/policy":
      oneOf(data.approval, ["ask", "allow-safe", "deny"], `${path}.approval`);
      optionalString(data.sandbox, `${path}.sandbox`);
      oneOf(data.source, ["default", "user", "profile", "fork"], `${path}.source`);
      break;
    case "session/pin":
      booleanValue(data.pinned, `${path}.pinned`);
      break;
    case "session/label":
      stringValue(data.label, `${path}.label`);
      oneOf(data.operation, ["add", "remove"], `${path}.operation`);
      break;
    case "session/rig":
      if (data.rigId !== null) stringValue(data.rigId, `${path}.rigId`);
      oneOf(data.source, ["user", "workspace", "fork"], `${path}.source`);
      break;
    case "turn/start":
      integer(data.turn, `${path}.turn`, 1);
      oneOf(data.cause, ["user", "followup", "goal-continuation", "cold-resume"], `${path}.cause`);
      break;
    case "turn/suspend":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      oneOf(data.reason, ["human-input"], `${path}.reason`);
      if (!Array.isArray(data.callIds)) fail("INVALID_EVENT", `${path}.callIds must be an array`, `${path}.callIds`);
      data.callIds.forEach((callId, index) => stringValue(callId, `${path}.callIds[${index}]`));
      if (!Array.isArray(data.approvalIds)) fail("INVALID_EVENT", `${path}.approvalIds must be an array`, `${path}.approvalIds`);
      data.approvalIds.forEach((approvalId, index) => stringValue(approvalId, `${path}.approvalIds[${index}]`));
      if (data.callIds.length === 0 && data.approvalIds.length === 0) {
        fail("INVALID_EVENT", `${path} must identify at least one pending interaction`, path);
      }
      break;
    case "turn/resume":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      oneOf(data.cause, ["response", "cancel"], `${path}.cause`);
      break;
    case "turn/end": { // reason details are JSON-safe and narrowed by kind.
      integer(data.turn, `${path}.turn`, 1);
      const reason = jsonObject(data.reason, `${path}.reason`);
      const kind = oneOf(reason.kind, ["completed", "aborted", "blocked", "provider-error", "max-output-tokens", "max-steps", "approval-terminal", "interrupted"], `${path}.reason.kind`);
      if (kind === "aborted") jsonObject(reason.cause, `${path}.reason.cause`);
      if (kind === "blocked") optionalString(reason.reason, `${path}.reason.reason`);
      if (kind === "provider-error") structuredFailure(reason.failure, `${path}.reason.failure`);
      if (kind === "approval-terminal") oneOf(reason.outcome, ["rejected", "unavailable"], `${path}.reason.outcome`);
      if (kind === "interrupted" && reason.repair !== true) fail("INVALID_EVENT", "interrupted outcomes must be repair-authored", `${path}.reason.repair`);
      break;
    }
    case "step/start":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      break;
    case "step/end":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      if (data.reason !== undefined) oneOf(data.reason, ["completed", "aborted", "provider-error", "max-steps", "interrupted"], `${path}.reason`);
      break;
    case "user/message":
      integer(data.turn, `${path}.turn`, 1);
      jsonObject(data.message, `${path}.message`);
      oneOf(data.source, ["human", "followup", "steer", "inject", "goal"], `${path}.source`);
      if (data.attribution !== undefined) jsonObject(data.attribution, `${path}.attribution`);
      break;
    case "context/injected":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.kind, `${path}.kind`);
      assertLosslessJson(data.content, `${path}.content`);
      contributor(data.contributor, `${path}.contributor`);
      booleanValue(data.modelVisible, `${path}.modelVisible`);
      break;
    case "request/header":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.requestId, `${path}.requestId`);
      oneOf(data.reason, ["initial", "resume", "change", "step"], `${path}.reason`);
      requestHeader(data.header, `${path}.header`);
      break;
    case "request/context":
      stringValue(data.requestId, `${path}.requestId`);
      stringValue(data.providerRoute, `${path}.providerRoute`);
      stringValue(data.providerModelId, `${path}.providerModelId`);
      stringValue(data.selectedModelId, `${path}.selectedModelId`);
      optionalNumber(data.contextWindow, `${path}.contextWindow`, true);
      optionalNumber(data.maxOutputTokens, `${path}.maxOutputTokens`, true);
      if (data.adapterDefaults !== undefined) jsonObject(data.adapterDefaults, `${path}.adapterDefaults`);
      break;
    case "request/attempt":
      stringValue(data.requestId, `${path}.requestId`);
      integer(data.attempt, `${path}.attempt`, 1);
      optionalString(data.retryId, `${path}.retryId`);
      break;
    case "request/failure":
      stringValue(data.requestId, `${path}.requestId`);
      integer(data.attempt, `${path}.attempt`, 1);
      structuredFailure(data.failure, `${path}.failure`);
      break;
    case "assistant/chunk":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.requestId, `${path}.requestId`);
      jsonObject(data.chunk, `${path}.chunk`);
      break;
    case "assistant/message":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.requestId, `${path}.requestId`);
      jsonObject(data.message, `${path}.message`);
      if (data.usage !== undefined) tokenUsage(data.usage, `${path}.usage`);
      if (data.performance !== undefined) {
        const performance = jsonObject(data.performance, `${path}.performance`);
        finiteNumber(performance.requestStartedAt, `${path}.performance.requestStartedAt`);
        for (const key of ["firstByteAt", "firstChunkAt", "firstTextAt", "firstReasoningAt", "endedAt", "timeToFirstTokenMs", "decodeDurationMs", "outputTokensPerSecond"])
          optionalNumber(performance[key], `${path}.performance.${key}`);
      }
      stringValue(data.finishReason, `${path}.finishReason`);
      if (data.interrupted !== undefined && data.interrupted !== true) fail("INVALID_EVENT", `${path}.interrupted can only be true`, `${path}.interrupted`);
      break;
    case "tool/call":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.requestId, `${path}.requestId`);
      stringValue(data.callId, `${path}.callId`);
      stringValue(data.name, `${path}.name`);
      stringValue(data.rawArguments, `${path}.rawArguments`, true);
      if (data.parsedInput !== undefined) assertLosslessJson(data.parsedInput, `${path}.parsedInput`);
      contributor(data.contributor, `${path}.contributor`);
      oneOf(data.concurrency, ["safe", "exclusive"], `${path}.concurrency`);
      break;
    case "approval/request":
      stringValue(data.approvalId, `${path}.approvalId`);
      stringValue(data.callId, `${path}.callId`);
      jsonObject(data.policy, `${path}.policy`);
      jsonObject(data.reason, `${path}.reason`);
      break;
    case "approval/decision":
      stringValue(data.approvalId, `${path}.approvalId`);
      stringValue(data.callId, `${path}.callId`);
      oneOf(data.outcome, ["allowed-once", "allowed-by-policy", "rejected", "cancelled", "unavailable"], `${path}.outcome`);
      if (data.responder !== undefined) oneOf(data.responder, ["user", "policy", "parent"], `${path}.responder`);
      break;
    case "tool/result":
      integer(data.turn, `${path}.turn`, 1);
      integer(data.step, `${path}.step`, 1);
      stringValue(data.callId, `${path}.callId`);
      assertLosslessJson(data.canonicalOutput, `${path}.canonicalOutput`);
      jsonObject(data.modelContent, `${path}.modelContent`);
      if (data.presentation !== undefined) jsonObject(data.presentation, `${path}.presentation`);
      if (data.error !== undefined) {
        const error = jsonObject(data.error, `${path}.error`);
        stringValue(error.name, `${path}.error.name`);
        stringValue(error.code, `${path}.error.code`);
        stringValue(error.message, `${path}.error.message`, true);
      }
      if (data.timing !== undefined) {
        const timing = jsonObject(data.timing, `${path}.timing`);
        finiteNumber(timing.startedAt, `${path}.timing.startedAt`);
        optionalNumber(timing.endedAt, `${path}.timing.endedAt`);
      }
      if (data.recovered !== undefined) oneOf(data.recovered, ["not-started", "outcome-unknown"], `${path}.recovered`);
      break;
    case "retry/scheduled":
      stringValue(data.retryId, `${path}.retryId`);
      stringValue(data.requestId, `${path}.requestId`);
      integer(data.previousAttempt, `${path}.previousAttempt`, 1);
      integer(data.nextAttempt, `${path}.nextAttempt`, 2);
      integer(data.delayMs, `${path}.delayMs`);
      structuredFailure(data.reason, `${path}.reason`);
      break;
    case "retry/started":
      stringValue(data.retryId, `${path}.retryId`);
      stringValue(data.requestId, `${path}.requestId`);
      integer(data.attempt, `${path}.attempt`, 2);
      break;
    case "retry/cancelled":
      stringValue(data.retryId, `${path}.retryId`);
      jsonObject(data.reason, `${path}.reason`);
      break;
    case "compaction/start": {
      stringValue(data.compactionId, `${path}.compactionId`);
      oneOf(data.trigger, ["automatic", "manual", "provider-overflow"], `${path}.trigger`);
      integer(data.measuredTokens, `${path}.measuredTokens`);
      const candidate = objectValue(data.candidate, `${path}.candidate`);
      const start = integer(candidate.start, `${path}.candidate.start`);
      const end = integer(candidate.end, `${path}.candidate.end`);
      if (start > end) fail("INVALID_EVENT", "compaction candidate start must not exceed end", `${path}.candidate.start`);
      stringValue(data.policyRevision, `${path}.policyRevision`);
      break;
    }
    case "compaction/summary":
      stringValue(data.compactionId, `${path}.compactionId`);
      jsonObject(data.request, `${path}.request`);
      assertLosslessJson(data.summary, `${path}.summary`);
      if (data.usage !== undefined) tokenUsage(data.usage, `${path}.usage`);
      if (data.rawOutput !== undefined) jsonObject(data.rawOutput, `${path}.rawOutput`);
      break;
    case "compaction/message":
      stringValue(data.compactionId, `${path}.compactionId`);
      assertLosslessJson(data.content, `${path}.content`);
      break;
    case "compaction/end":
      stringValue(data.compactionId, `${path}.compactionId`);
      {
        const outcome = oneOf(data.outcome, ["succeeded", "failed", "cancelled", "declined"], `${path}.outcome`);
        if (outcome === "failed" && data.failure === undefined) fail("INVALID_EVENT", "failed compaction requires a structured failure", `${path}.failure`);
        if (outcome !== "failed" && data.failure !== undefined) fail("INVALID_EVENT", "only failed compaction may carry a failure", `${path}.failure`);
      }
      if (data.failure !== undefined) structuredFailure(data.failure, `${path}.failure`);
      break;
    case "compaction/policy": {
      booleanValue(data.declined, `${path}.declined`);
      oneOf(data.reason, ["failure", "success", "manual-success", "declined", "context-recovered"], `${path}.reason`);
      const health = objectValue(data.health, `${path}.health`);
      integer(health.consecutiveFailures, `${path}.health.consecutiveFailures`);
      integer(health.turnsSinceCompact, `${path}.health.turnsSinceCompact`);
      integer(health.rapidRefills, `${path}.health.rapidRefills`);
      if (health.breakerOpen !== undefined) oneOf(health.breakerOpen, ["failure", "thrash"], `${path}.health.breakerOpen`);
      if (health.nextAttemptAfter !== undefined) integer(health.nextAttemptAfter, `${path}.health.nextAttemptAfter`);
      break;
    }
    case "workspace/checkpoint":
      stringValue(data.checkpointId, `${path}.checkpointId`);
      stringValue(data.backend, `${path}.backend`);
      assertLosslessJson(data.reference, `${path}.reference`);
      optionalString(data.summary, `${path}.summary`);
      break;
    case "subagent/start":
      stringValue(data.childSessionId, `${path}.childSessionId`);
      assertLosslessJson(data.request, `${path}.request`);
      break;
    case "subagent/report":
      stringValue(data.childSessionId, `${path}.childSessionId`);
      assertLosslessJson(data.content, `${path}.content`);
      if (data.sourceEventSeqs !== undefined) {
        if (!Array.isArray(data.sourceEventSeqs)) fail("INVALID_EVENT", `${path}.sourceEventSeqs must be an array`, `${path}.sourceEventSeqs`);
        data.sourceEventSeqs.forEach((seq, index) => integer(seq, `${path}.sourceEventSeqs[${index}]`));
      }
      break;
    case "subagent/end":
      stringValue(data.childSessionId, `${path}.childSessionId`);
      stringValue(data.outcome, `${path}.outcome`);
      break;
    case "adapter/event":
      stringValue(data.adapter, `${path}.adapter`);
      stringValue(data.kind, `${path}.kind`);
      assertLosslessJson(data.payload, `${path}.payload`);
      break;
    default:
      fail("UNKNOWN_REQUIRED_EVENT", `unknown required event type ${type}`, "event.type");
  }

  assertLosslessJson(data, path);
}

export function parseSessionHeader(value: unknown): SessionHeader {
  const header = objectValue(value, "header", "INVALID_HEADER");
  exactKeys(
    header,
    [
      "formatVersion",
      "id",
      "createdAt",
      "authority",
      "backend",
      "fidelity",
      "rigId",
      "workspace",
      "parent",
      "origin",
      "delegationDepth",
      "agentComposition",
    ],
    "header",
    "INVALID_HEADER",
  );
  if (header.formatVersion !== SESSION_FORMAT_VERSION) {
    fail("FORMAT_UNSUPPORTED", `unsupported session format ${String(header.formatVersion)}`, "header.formatVersion");
  }
  if (typeof header.id !== "string" || header.id.length === 0) fail("INVALID_HEADER", "header.id must be a non-empty string", "header.id");
  if (typeof header.createdAt !== "number" || !Number.isFinite(header.createdAt) || header.createdAt < 0) fail("INVALID_HEADER", "header.createdAt must be a non-negative finite number", "header.createdAt");
  if (header.authority !== "v2") fail("INVALID_HEADER", "header.authority is invalid", "header.authority");
  if (typeof header.backend !== "string" || header.backend.length === 0) fail("INVALID_HEADER", "header.backend must be a non-empty string", "header.backend");
  if (!["full", "adapter"].includes(header.fidelity as string)) fail("INVALID_HEADER", "header.fidelity is invalid", "header.fidelity");
  if (header.rigId !== undefined && (typeof header.rigId !== "string" || header.rigId.length === 0)) fail("INVALID_HEADER", "header.rigId must be a non-empty string", "header.rigId");
  if (header.origin !== undefined && !["user", "compaction", "fork", "rerun", "subagent"].includes(header.origin as string)) fail("INVALID_HEADER", "header.origin is invalid", "header.origin");

  if (header.workspace !== undefined) {
    const workspace = objectValue(header.workspace, "header.workspace", "INVALID_HEADER");
    exactKeys(workspace, ["rootHash", "rootPath"], "header.workspace", "INVALID_HEADER");
    if (typeof workspace.rootHash !== "string" || workspace.rootHash.length === 0) fail("INVALID_HEADER", "workspace root hash is required", "header.workspace.rootHash");
    if (workspace.rootPath !== undefined && typeof workspace.rootPath !== "string") fail("INVALID_HEADER", "workspace root path must be a string", "header.workspace.rootPath");
  }
  if (header.parent !== undefined) {
    const parent = objectValue(header.parent, "header.parent", "INVALID_HEADER");
    exactKeys(parent, ["sessionId", "boundarySeq", "seedLength"], "header.parent", "INVALID_HEADER");
    if (typeof parent.sessionId !== "string" || parent.sessionId.length === 0) fail("INVALID_HEADER", "parent session id is required", "header.parent.sessionId");
    if (parent.sessionId === header.id) fail("INVALID_HEADER", "a session cannot parent itself", "header.parent.sessionId");
    if (!Number.isSafeInteger(parent.boundarySeq) || (parent.boundarySeq as number) < 0) fail("INVALID_HEADER", "parent boundary must be a non-negative sequence", "header.parent.boundarySeq");
    if (!Number.isSafeInteger(parent.seedLength) || (parent.seedLength as number) < 0) fail("INVALID_HEADER", "parent seed length must be non-negative", "header.parent.seedLength");
  }
  if (header.delegationDepth !== undefined && (!Number.isSafeInteger(header.delegationDepth) || (header.delegationDepth as number) < 0)) fail("INVALID_HEADER", "delegation depth must be non-negative", "header.delegationDepth");
  if (header.agentComposition !== undefined) {
    const composition = objectValue(header.agentComposition, "header.agentComposition", "INVALID_HEADER");
    exactKeys(composition, ["presetId", "profileRevision"], "header.agentComposition", "INVALID_HEADER");
    if (composition.presetId !== undefined && typeof composition.presetId !== "string") fail("INVALID_HEADER", "preset id must be a string", "header.agentComposition.presetId");
    if (composition.profileRevision !== undefined && typeof composition.profileRevision !== "string") fail("INVALID_HEADER", "profile revision must be a string", "header.agentComposition.profileRevision");
  }
  if ((header.origin === "fork" || header.origin === "rerun") && header.parent === undefined) fail("INVALID_HEADER", `${header.origin} origin requires parent provenance`, "header.parent");

  try {
    assertLosslessJson(header, "header");
  } catch (error) {
    if (error instanceof SessionContractError) {
      throw new SessionContractError({ code: "INVALID_HEADER", message: error.message, path: error.path, cause: error });
    }
    throw error;
  }
  return header as unknown as SessionHeader;
}

function parseEventEnvelope(value: unknown, options: SessionEventParseOptions, allowSequence: boolean): ParsedSessionEvent | AppendSessionEvent {
  const event = objectValue(value, "event");
  const type = stringValue(event.type, "event.type");
  const seq = allowSequence ? integer(event.seq, "event.seq") : Number.MAX_SAFE_INTEGER;
  if (!allowSequence && "seq" in event) fail("INVALID_EVENT", "append intent cannot assign a committed sequence", "event.seq");
  finiteNumber(event.time, "event.time");
  if (event.ignorable !== undefined && event.ignorable !== true) fail("INVALID_EVENT", "event.ignorable can only be true", "event.ignorable");

  const extension = options.extensions?.[type];
  const isCore = coreTypes.has(type);
  if (!isCore && extension === undefined) {
    if (event.ignorable !== true) fail("UNKNOWN_REQUIRED_EVENT", `unknown required event type ${type}`, "event.type");
    validateSurface(event, type, false, seq);
    assertLosslessJson(event.data, "event.data");
    assertLosslessJson(event, "event");
    return event as unknown as ParsedSessionEvent;
  }
  if (event.ignorable === true) fail("INVALID_EVENT", "known behavioral events cannot be marked ignorable", "event.ignorable");

  validateSurface(event, type, isCore ? coreSurfaceTypes.has(type) : extension?.surface === true, seq);
  if (isCore) validateCoreData(type, event.data, "event.data");
  else {
    try {
      extension!.validateData(event.data, "event.data");
    } catch (error) {
      if (error instanceof SessionContractError) throw error;
      fail("INVALID_EVENT", `extension validator rejected ${type}`, "event.data", error);
    }
    assertLosslessJson(event.data, "event.data");
  }
  assertLosslessJson(event, "event");
  return event as unknown as ParsedSessionEvent;
}

export function parseSessionEvent(value: unknown, options: SessionEventParseOptions = {}): ParsedSessionEvent {
  return parseEventEnvelope(value, options, true) as ParsedSessionEvent;
}

export function parseAppendSessionEvent(value: unknown, options: SessionEventParseOptions = {}): AppendSessionEvent {
  return parseEventEnvelope(value, options, false) as AppendSessionEvent;
}

/** Useful to consumers constructing already-validated headers without exposing casts. */
export function sessionHeaderIdentity(value: SessionHeader): { readonly id: ReturnType<typeof SessionId> } {
  return { id: SessionId(value.id) };
}

/** Useful to storage implementations after they allocate a validated sequence. */
export function committedSequence(value: number): ReturnType<typeof SessionSeq> {
  return SessionSeq(value);
}
