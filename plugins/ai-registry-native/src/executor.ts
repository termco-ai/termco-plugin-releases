import {
  type AiToolApprovalResolution,
  type AiToolCallIdentity,
  type AiToolCompletionInput,
  type AiToolEntry,
  type AiToolExecutionCapability,
  type AiToolExecutionError,
  type AiToolExecutionInput,
  type AiToolExecutionResult,
  type AiStandaloneToolExecutionResult,
} from "@termco/ai-tools-base";
import {
  ApprovalId,
  RequestId,
  SESSION_FORMAT_VERSION,
  SessionId,
  StepId,
  ToolCallId,
  TurnId,
  type JsonObject,
  type JsonValue,
  type ParsedSessionEvent,
  type SessionHistoryCapability,
} from "@termco/session-base";
import { validateAiToolInput } from "./jsonSchema";
import { OrderedToolScheduler } from "./scheduler";

function jsonValue(value: unknown): JsonValue {
  try {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? null : JSON.parse(encoded) as JsonValue;
  } catch {
    return String(value);
  }
}

function jsonObject(value: unknown): JsonObject {
  const parsed = jsonValue(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as JsonObject
    : { value: parsed };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function classifyConcurrency(definition: AiToolEntry): "safe" | "exclusive" {
  return definition.concurrency === "safe" ? "safe" : "exclusive";
}

async function policyValue(
  value: AiToolEntry["needsApproval"],
  input: unknown,
): Promise<boolean> {
  return typeof value === "function" ? Boolean(await value(input)) : value === true;
}

async function resolveApproval(input: {
  readonly definition: AiToolEntry;
  readonly input: unknown;
  readonly mode: "ask" | "allow-safe" | "deny";
}): Promise<AiToolApprovalResolution> {
  const required = await policyValue(input.definition.needsApproval, input.input);
  const mandatory = await policyValue(
    input.definition.alwaysNeedsApproval,
    input.input,
  );
  if (input.mode === "deny") {
    return {
      action: "deny",
      policy: { mode: input.mode },
      reason: { kind: "session-policy" },
    };
  }
  if (mandatory) {
    return {
      action: "ask",
      policy: { mode: input.mode, mandatory: true },
      reason: { kind: "mandatory" },
    };
  }
  if (input.mode === "allow-safe") {
    return {
      action: "allow",
      policy: { mode: input.mode },
      reason: { kind: "auto-run" },
    };
  }
  return required
    ? {
        action: "ask",
        policy: { mode: input.mode },
        reason: { kind: "tool-policy" },
      }
    : {
        action: "allow",
        policy: { mode: input.mode },
        reason: { kind: "read-only" },
      };
}

function structuredError(cause: unknown, defaultCode: string): AiToolExecutionError {
  const record = cause && typeof cause === "object"
    ? cause as { name?: unknown; code?: unknown; message?: unknown }
    : {};
  return {
    name: typeof record.name === "string" && record.name.length > 0
      ? record.name
      : "AiToolExecutionError",
    code: typeof record.code === "string" && record.code.length > 0
      ? record.code
      : defaultCode,
    message: typeof record.message === "string" && record.message.length > 0
      ? record.message
      : String(cause),
  };
}

function timeoutReason(timeoutMs: number): Error & { code: string } {
  return Object.assign(
    new Error(`Tool execution exceeded ${timeoutMs}ms`),
    { name: "TimeoutError", code: "TIMEOUT" },
  );
}

function executionStateError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    name: "AiToolExecutionStateError",
    code,
  });
}

function terminalSignature(result: AiToolExecutionResult): string {
  return canonicalJson({
    ok: result.ok,
    canonicalOutput: result.canonicalOutput,
    modelContent: result.modelContent,
    ...(!result.ok ? { error: result.error } : {}),
  });
}

function callIdentitySignature(
  input: AiToolCallIdentity,
  concurrency: "safe" | "exclusive",
): string {
  return canonicalJson({
    turn: input.turn,
    step: input.step,
    requestId: input.requestId,
    callId: input.callId,
    name: input.name,
    parsedInput: jsonValue(input.input),
    contributor: jsonValue(input.contributor),
    concurrency,
  });
}

async function invokeToolBody(input: AiToolExecutionInput, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const abortFromParent = () => {
    if (!controller.signal.aborted) {
      controller.abort(input.signal?.reason ?? new Error("Tool execution was cancelled"));
    }
  };
  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  const timeout = timeoutMs > 0
    ? setTimeout(() => {
        if (!controller.signal.aborted) {
          controller.abort(timeoutReason(timeoutMs));
        }
      }, timeoutMs)
    : undefined;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const body = Promise.resolve(input.definition.execute(input.input));
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(controller.signal.reason),
        { once: true },
      );
    });
    return await Promise.race([body, aborted]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    input.signal?.removeEventListener("abort", abortFromParent);
  }
}

function modelContent(input: AiToolCompletionInput, output: unknown): JsonObject {
  if (input.definition.toModelOutput) {
    try {
      return jsonObject(input.definition.toModelOutput({ output }));
    } catch {
      // The completed side effect must not be retried merely because a display
      // formatter failed. Canonical JSON remains a lossless model payload.
    }
  }
  return { type: "json", value: jsonValue(output) };
}

export function createAiToolExecutor(dependencies: {
  readonly history: SessionHistoryCapability;
  readonly now?: () => number;
  readonly nextSessionId?: () => SessionId;
  readonly maxSafeConcurrency?: number;
  readonly toolTimeoutMs?: number;
}): AiToolExecutionCapability {
  const now = dependencies.now ?? Date.now;
  const nextSessionId = dependencies.nextSessionId ??
    (() => SessionId(`tool-${crypto.randomUUID()}`));
  const schedulers = new Map<string, OrderedToolScheduler<AiToolExecutionResult>>();
  const recordedCalls = new Map<string, {
    readonly signature: string;
    readonly persisted: Promise<void>;
    readonly order: number;
    readonly scheduler: OrderedToolScheduler<AiToolExecutionResult>;
  }>();
  const approvalRecords = new Map<string, {
    readonly callKey: string;
    readonly requestSignature: string;
    readonly request: Promise<void>;
    decision?: {
      readonly signature: string;
      readonly persisted: Promise<void>;
    };
  }>();
  const approvalHydrations = new Map<string, Promise<{
    readonly callKey: string;
    readonly requestSignature: string;
    readonly request: Promise<void>;
    decision?: {
      readonly signature: string;
      readonly persisted: Promise<void>;
    };
  } | null>>();
  const completionRecords = new Map<string, {
    readonly callSignature: string;
    readonly signature: string;
    readonly result: Promise<AiToolExecutionResult>;
  }>();
  const executionRecords = new Map<string, {
    readonly callSignature: string;
    readonly result: Promise<AiToolExecutionResult>;
  }>();
  const callKey = (sessionId: string, callId: string) => `${sessionId}\u0000${callId}`;
  const approvalKey = (sessionId: string, approvalId: string) =>
    `${sessionId}\u0000${approvalId}`;

  const readDurableEvents = async (sessionId: SessionId): Promise<readonly ParsedSessionEvent[]> => {
    const events = new Map<number, ParsedSessionEvent>();
    let window = await dependencies.history.readWindow(sessionId, { kind: "tail", limit: 256 });
    while (true) {
      for (const event of window.events) events.set(event.seq as number, event);
      if (!window.availability.earlier) break;
      const first = window.events[0];
      if (!first) {
        throw executionStateError(
          "PERSISTED_HISTORY_GAP",
          `session ${sessionId} reports earlier events without a readable boundary`,
        );
      }
      window = await dependencies.history.readWindow(sessionId, {
        kind: "before",
        seq: first.seq,
        limit: 256,
      });
    }
    return [...events.values()].sort((left, right) => left.seq - right.seq);
  };

  const assertPersistedCall = (
    event: ParsedSessionEvent,
    input: AiToolCallIdentity,
    concurrency?: "safe" | "exclusive",
  ) => {
    const data = event.data as unknown as Record<string, unknown>;
    const actual = {
      turn: data.turn,
      step: data.step,
      requestId: data.requestId,
      callId: data.callId,
      name: data.name,
      parsedInput: data.parsedInput,
      contributor: data.contributor,
      ...(concurrency ? { concurrency: data.concurrency } : {}),
    };
    const expected = {
      turn: input.turn,
      step: input.step,
      requestId: input.requestId,
      callId: input.callId,
      name: input.name,
      parsedInput: jsonValue(input.input),
      contributor: jsonValue(input.contributor),
      ...(concurrency ? { concurrency } : {}),
    };
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw executionStateError(
        "PERSISTED_CALL_MISMATCH",
        `durable tool call ${input.callId} does not match the supplied call identity`,
      );
    }
  };

  const ensureDurableCall = async (
    input: Parameters<AiToolExecutionCapability["recordCall"]>[0],
  ): Promise<void> => {
    const events = await readDurableEvents(SessionId(input.sessionId));
    const persisted = events.find((event) =>
      event.type === "tool/call" &&
      String((event.data as unknown as { callId?: unknown }).callId ?? "") === String(input.callId));
    if (persisted) {
      assertPersistedCall(persisted, input, input.concurrency ?? "exclusive");
      return;
    }
    await dependencies.history.append(SessionId(input.sessionId), [{
      type: "tool/call",
      time: now(),
      data: {
        turn: input.turn,
        step: input.step,
        requestId: input.requestId,
        callId: input.callId,
        name: input.name,
        rawArguments: JSON.stringify(jsonValue(input.input)),
        parsedInput: jsonValue(input.input),
        contributor: input.contributor,
        concurrency: input.concurrency ?? "exclusive",
      },
    }], { durability: "flushed" });
  };

  const registerCall = (
    input: Parameters<AiToolExecutionCapability["recordCall"]>[0],
    options: { readonly rehydrate?: boolean } = {},
  ) => {
    const key = callKey(input.sessionId, input.callId);
    const signature = callIdentitySignature(input, input.concurrency ?? "exclusive");
    const existing = recordedCalls.get(key);
    if (existing) {
      if (existing.signature !== signature) {
        throw executionStateError(
          "PERSISTED_CALL_MISMATCH",
          `tool call ${input.callId} was already registered with a different identity`,
        );
      }
      return existing;
    }
    const scheduler = schedulers.get(input.sessionId) ??
      new OrderedToolScheduler<AiToolExecutionResult>(dependencies.maxSafeConcurrency ?? 4);
    schedulers.set(input.sessionId, scheduler);
    const order = scheduler.register(input.concurrency ?? "exclusive");
    const persisted = options.rehydrate ? ensureDurableCall(input) : dependencies.history.append(SessionId(input.sessionId), [{
      type: "tool/call",
      time: now(),
      data: {
        turn: input.turn,
        step: input.step,
        requestId: input.requestId,
        callId: input.callId,
        name: input.name,
        rawArguments: JSON.stringify(jsonValue(input.input)),
        parsedInput: jsonValue(input.input),
        contributor: input.contributor,
        concurrency: input.concurrency ?? "exclusive",
      },
    }], { durability: "flushed" }).then(() => undefined);
    const registration = { signature, persisted, order, scheduler };
    recordedCalls.set(key, registration);
    void persisted.catch(() => {
      if (recordedCalls.get(key) === registration) recordedCalls.delete(key);
    });
    return registration;
  };

  const hydrateApproval = async (input: Parameters<AiToolExecutionCapability["recordApprovalDecision"]>[0]) => {
    const key = approvalKey(input.call.sessionId, input.approvalId);
    const pending = approvalHydrations.get(key);
    if (pending) return pending;
    const hydration = (async () => {
      const events = await readDurableEvents(SessionId(input.call.sessionId));
      const call = events.find((event) =>
        event.type === "tool/call" &&
        String((event.data as unknown as { callId?: unknown }).callId ?? "") === String(input.call.callId));
      if (!call) return null;
      assertPersistedCall(call, input.call);
      const request = events.find((event) => {
        if (event.type !== "approval/request") return false;
        const data = event.data as unknown as { approvalId?: unknown; callId?: unknown };
        return String(data.approvalId ?? "") === String(input.approvalId) &&
          String(data.callId ?? "") === String(input.call.callId);
      });
      if (!request) return null;
      const requestData = request.data as unknown as Record<string, unknown>;
      const record = {
        callKey: callKey(input.call.sessionId, input.call.callId),
        requestSignature: JSON.stringify({
          policy: requestData.policy,
          reason: requestData.reason,
        }),
        request: Promise.resolve(),
      } as {
        readonly callKey: string;
        readonly requestSignature: string;
        readonly request: Promise<void>;
        decision?: { readonly signature: string; readonly persisted: Promise<void> };
      };
      const decision = events.find((event) => {
        if (event.type !== "approval/decision") return false;
        const data = event.data as unknown as { approvalId?: unknown; callId?: unknown };
        return String(data.approvalId ?? "") === String(input.approvalId) &&
          String(data.callId ?? "") === String(input.call.callId);
      });
      if (decision) {
        const data = decision.data as unknown as Record<string, unknown>;
        record.decision = {
          signature: JSON.stringify({ outcome: data.outcome, responder: data.responder ?? null }),
          persisted: Promise.resolve(),
        };
      }
      const current = approvalRecords.get(key);
      if (current) return current;
      approvalRecords.set(key, record);
      return record;
    })();
    approvalHydrations.set(key, hydration);
    try {
      return await hydration;
    } finally {
      if (approvalHydrations.get(key) === hydration) approvalHydrations.delete(key);
    }
  };

  const persistedTerminalResult = async (
    sessionId: SessionId,
    callId: ToolCallId,
  ): Promise<AiToolExecutionResult | null> => {
    const events = await readDurableEvents(sessionId);
    const results = events.filter((event) =>
      event.type === "tool/result" &&
      String((event.data as unknown as { callId?: unknown }).callId ?? "") === String(callId));
    if (results.length > 1) {
      throw executionStateError(
        "DUPLICATE_PERSISTED_RESULT",
        `durable tool call ${callId} has more than one terminal result`,
      );
    }
    const result = results[0];
    if (!result) return null;
    const data = result.data as unknown as Record<string, unknown>;
    const canonicalOutput = data.canonicalOutput as JsonValue;
    const persistedModelContent = data.modelContent as JsonObject;
    if (data.error !== undefined) {
      return {
        ok: false,
        error: data.error as AiToolExecutionError,
        canonicalOutput,
        modelContent: persistedModelContent,
      };
    }
    return {
      ok: true,
      output: canonicalOutput,
      canonicalOutput,
      modelContent: persistedModelContent,
    };
  };

  const recordCall: AiToolExecutionCapability["recordCall"] = async (input) => {
    await registerCall(input).persisted;
  };

  const storeResult = async (
    input: AiToolCompletionInput,
    result: AiToolExecutionResult,
    startedAt: number,
  ): Promise<void> => {
    await dependencies.history.append(SessionId(input.sessionId), [{
      type: "tool/result",
      time: now(),
      data: {
        turn: input.turn,
        step: input.step,
        callId: input.callId,
        canonicalOutput: result.canonicalOutput,
        modelContent: result.modelContent,
        ...(input.presentation ? { presentation: input.presentation } : {}),
        ...(!result.ok ? { error: result.error } : {}),
        timing: { startedAt, endedAt: now() },
      },
      surfaceOp: { op: "append" },
    }], { durability: "flushed" });
  };

  const capability: AiToolExecutionCapability = {
    resolveApproval,
    recordCall,
    async recordApprovalRequest(input) {
      const key = approvalKey(input.call.sessionId, input.approvalId);
      const owner = callKey(input.call.sessionId, input.call.callId);
      const signature = JSON.stringify({
        policy: input.resolution.policy,
        reason: input.resolution.reason,
      });
      const existing = approvalRecords.get(key);
      if (existing) {
        if (existing.callKey !== owner || existing.requestSignature !== signature) {
          throw executionStateError(
            "STALE_APPROVAL",
            `approval ${input.approvalId} does not belong to call ${input.call.callId}`,
          );
        }
        await existing.request;
        return;
      }
      const request = (async () => {
        await recordCall(input.call);
        await dependencies.history.append(SessionId(input.call.sessionId), [{
          type: "approval/request",
          time: now(),
          data: {
            approvalId: input.approvalId,
            callId: input.call.callId,
            policy: input.resolution.policy,
            reason: input.resolution.reason,
          },
        }], { durability: "flushed" });
      })();
      const record = {
        callKey: owner,
        requestSignature: signature,
        request,
      };
      approvalRecords.set(key, record);
      try {
        await request;
      } catch (error) {
        if (approvalRecords.get(key) === record) approvalRecords.delete(key);
        throw error;
      }
    },
    async recordApprovalDecision(input) {
      const key = approvalKey(input.call.sessionId, input.approvalId);
      const owner = callKey(input.call.sessionId, input.call.callId);
      const record = approvalRecords.get(key) ?? await hydrateApproval(input);
      if (!record || record.callKey !== owner) {
        throw executionStateError(
          "STALE_APPROVAL",
          `approval ${input.approvalId} is not pending for call ${input.call.callId}`,
        );
      }
      const signature = JSON.stringify({
        outcome: input.outcome,
        responder: input.responder ?? null,
      });
      if (record.decision) {
        if (record.decision.signature !== signature) {
          throw executionStateError(
            "APPROVAL_ALREADY_DECIDED",
            `approval ${input.approvalId} already has a different decision`,
          );
        }
        await record.decision.persisted;
        return;
      }
      const persisted = (async () => {
        await record.request;
        await dependencies.history.append(SessionId(input.call.sessionId), [{
          type: "approval/decision",
          time: now(),
          data: {
            approvalId: input.approvalId,
            callId: input.call.callId,
            outcome: input.outcome,
            ...(input.responder ? { responder: input.responder } : {}),
          },
        }], { durability: "flushed" });
      })();
      record.decision = { signature, persisted };
      await persisted;
    },
    async complete(input) {
      const startedAt = input.startedAt ?? now();
      let result: AiToolExecutionResult;
      if (input.error) {
        const canonicalOutput = jsonValue({ ok: false, error: input.error });
        result = {
          ok: false,
          error: input.error,
          canonicalOutput,
          modelContent: { type: "json", value: canonicalOutput },
        };
      } else {
        const canonicalOutput = jsonValue(input.output);
        result = {
          ok: true,
          output: input.output,
          canonicalOutput,
          modelContent: modelContent(input, input.output),
        };
      }
      const key = callKey(input.sessionId, input.callId);
      const concurrency = classifyConcurrency(input.definition);
      const callSignature = callIdentitySignature(input, concurrency);
      const signature = terminalSignature(result);
      const executing = executionRecords.get(key);
      if (executing) {
        if (executing.callSignature !== callSignature) {
          throw executionStateError(
            "PERSISTED_CALL_MISMATCH",
            `tool call ${input.callId} is executing with a different identity`,
          );
        }
        const executed = await executing.result;
        if (terminalSignature(executed) !== signature) {
          throw executionStateError(
            "TOOL_RESULT_MISMATCH",
            `tool call ${input.callId} completed with a different terminal outcome`,
          );
        }
        return executed;
      }
      const existing = completionRecords.get(key);
      if (existing) {
        if (existing.callSignature !== callSignature) {
          throw executionStateError(
            "PERSISTED_CALL_MISMATCH",
            `tool call ${input.callId} completed with a different call identity`,
          );
        }
        if (existing.signature !== signature) {
          throw executionStateError(
            "TOOL_RESULT_MISMATCH",
            `tool call ${input.callId} already has a different terminal outcome`,
          );
        }
        return existing.result;
      }
      const completion = (async () => {
        const registration = registerCall({
          ...input,
          concurrency,
        }, { rehydrate: true });
        await registration.persisted;
        const durableResult = await persistedTerminalResult(
          SessionId(input.sessionId),
          input.callId,
        );
        if (durableResult !== null) {
          if (terminalSignature(durableResult) !== signature) {
            throw executionStateError(
              "TOOL_RESULT_MISMATCH",
              `durable tool call ${input.callId} already has a different terminal outcome`,
            );
          }
          return registration.scheduler.complete(
            registration.order,
            result,
            async () => undefined,
          );
        }
        return registration.scheduler.complete(
          registration.order,
          result,
          (terminal) => storeResult(input, terminal, startedAt),
        );
      })();
      const record = { callSignature, signature, result: completion };
      completionRecords.set(key, record);
      void completion.catch(() => {
        if (completionRecords.get(key) === record) completionRecords.delete(key);
      });
      return completion;
    },
    async execute(input) {
      const startedAt = now();
      const key = callKey(input.sessionId, input.callId);
      const concurrency = classifyConcurrency(input.definition);
      const callSignature = callIdentitySignature(input, concurrency);
      const existingExecution = executionRecords.get(key);
      if (existingExecution) {
        if (existingExecution.callSignature !== callSignature) {
          throw executionStateError(
            "PERSISTED_CALL_MISMATCH",
            `tool call ${input.callId} is executing with a different identity`,
          );
        }
        return existingExecution.result;
      }
      const completed = completionRecords.get(key);
      if (completed) {
        if (completed.callSignature !== callSignature) {
          throw executionStateError(
            "PERSISTED_CALL_MISMATCH",
            `tool call ${input.callId} completed with a different call identity`,
          );
        }
        return completed.result;
      }
      const execution = (async () => {
        const registration = registerCall({ ...input, concurrency }, { rehydrate: true });
        await registration.persisted;
        const durableResult = await persistedTerminalResult(
          SessionId(input.sessionId),
          input.callId,
        );
        if (durableResult) {
          return registration.scheduler.complete(
            registration.order,
            durableResult,
            async () => undefined,
          );
        }
        return registration.scheduler.execute(
          registration.order,
          async () => {
            const issues = validateAiToolInput(input.definition.inputSchema, input.input);
            let result: AiToolExecutionResult;
            if (issues.length > 0) {
              const error: AiToolExecutionError = {
                name: "AiToolExecutionError",
                code: "INVALID_INPUT",
                message: `Invalid arguments for ${input.name}: ${issues.join("; ")}`,
              };
              const canonicalOutput = jsonValue({ ok: false, error });
              result = {
                ok: false,
                error,
                canonicalOutput,
                modelContent: { type: "json", value: canonicalOutput },
              };
            } else if (input.signal?.aborted) {
              const error: AiToolExecutionError = {
                name: "ToolNotStarted",
                code: "TOOL_NOT_STARTED",
                message: String(input.signal.reason ?? "Tool execution was cancelled before starting"),
              };
              const canonicalOutput = jsonValue({ ok: false, error });
              result = {
                ok: false,
                error,
                canonicalOutput,
                modelContent: { type: "json", value: canonicalOutput },
              };
            } else {
              try {
                const output = await invokeToolBody(input, dependencies.toolTimeoutMs ?? 120_000);
                const canonicalOutput = jsonValue(output);
                result = {
                  ok: true,
                  output,
                  canonicalOutput,
                  modelContent: modelContent(input, output),
                };
              } catch (cause) {
                const aborted = input.signal?.aborted;
                const error = structuredError(
                  cause,
                  aborted ? "CANCELLED" : "TOOL_THREW",
                );
                const canonicalOutput = jsonValue({ ok: false, error });
                result = {
                  ok: false,
                  error,
                  canonicalOutput,
                  modelContent: { type: "json", value: canonicalOutput },
                };
              }
            }
            return result;
          },
          (terminal) => storeResult(input, terminal, startedAt),
        );
      })();
      const record = { callSignature, result: execution };
      executionRecords.set(key, record);
      void execution.catch(() => {
        if (executionRecords.get(key) === record) executionRecords.delete(key);
      });
      return execution;
    },
    async executeStandalone(input): Promise<AiStandaloneToolExecutionResult> {
      const sessionId = nextSessionId();
      const turn = TurnId(1);
      const step = StepId(1);
      const requestId = RequestId(input.externalRequestId);
      const callId = ToolCallId(input.externalRequestId);
      const createdAt = now();
      await dependencies.history.create({
        header: {
          formatVersion: SESSION_FORMAT_VERSION,
          id: sessionId,
          createdAt,
          authority: "v2",
          backend: input.backend,
          fidelity: "full",
          ...(input.rigId ? { rigId: input.rigId } : {}),
        },
        seed: [
          {
            type: "session/title",
            time: createdAt,
            data: { title: `${input.name} via ${input.backend}`, source: "system" },
          },
          { type: "turn/start", time: createdAt, data: { turn, cause: "user" } },
          { type: "step/start", time: createdAt, data: { turn, step } },
          {
            type: "request/header",
            time: createdAt,
            data: {
              turn,
              step,
              requestId,
              reason: "initial",
              header: {
                fidelity: "full",
                selectedModelId: input.backend,
                providerRoute: input.backend,
                providerModelId: input.backend,
                systemPrompt: "",
                messages: [],
                tools: [{
                  name: input.name,
                  description: input.definition.description ?? "",
                  schema: jsonObject(input.definition.inputSchema),
                  contributor: jsonObject(input.contributor),
                }],
                activeTools: [input.name],
                maxSteps: 1,
                approvalPolicy: { mode: "external" },
              },
            },
          },
          {
            type: "request/context",
            time: createdAt,
            data: {
              requestId,
              providerRoute: input.backend,
              providerModelId: input.backend,
              selectedModelId: input.backend,
            },
          },
          {
            type: "request/attempt",
            time: createdAt,
            data: { requestId, attempt: 1 },
          },
        ],
        durability: "flushed",
      });
      const executionInput = {
        sessionId,
        turn,
        step,
        requestId,
        callId,
        name: input.name,
        input: input.input,
        contributor: input.contributor,
        definition: input.definition,
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.presentation ? { presentation: input.presentation } : {}),
      } as const;
      const call = {
        sessionId,
        turn,
        step,
        requestId,
        callId,
        name: input.name,
        input: input.input,
        contributor: input.contributor,
        concurrency: classifyConcurrency(input.definition),
      } as const;
      await capability.recordCall(call);
      const resolution = await capability.resolveApproval({
        definition: input.definition,
        input: input.input,
        mode: "ask",
      });
      let result: AiToolExecutionResult;
      if (resolution.action !== "allow") {
        const approvalId = ApprovalId(`approval-${input.externalRequestId}`);
        await capability.recordApprovalRequest({ call, approvalId, resolution });
        const authorization = resolution.action === "deny"
          ? {
              allow: false,
              outcome: "rejected" as const,
              responder: "policy" as const,
              message: "Tool execution is denied by session policy",
            }
          : input.authorize
            ? await input.authorize({ resolution, approvalId, sessionId, callId })
            : {
                allow: false,
                outcome: "unavailable" as const,
                responder: "policy" as const,
                message: "Tool approval is unavailable",
              };
        const outcome = authorization.outcome ??
          (authorization.allow ? "allowed-once" : "rejected");
        await capability.recordApprovalDecision({
          call,
          approvalId,
          outcome,
          ...(authorization.responder ? { responder: authorization.responder } : {}),
        });
        if (!authorization.allow) {
          const message = authorization.message ??
            (outcome === "rejected" && authorization.responder === "user"
              ? "User declined tool execution"
              : outcome === "cancelled"
                ? "Tool approval was cancelled"
                : outcome === "unavailable"
                  ? "Tool approval is unavailable"
                  : "Tool execution was denied");
          result = await capability.complete({
            ...executionInput,
            error: {
              name: "ToolApprovalRejected",
              code: "TOOL_DENIED",
              message,
            },
          });
        } else {
          result = await capability.execute(executionInput);
        }
      } else {
        result = await capability.execute(executionInput);
      }
      await dependencies.history.append(sessionId, [
        {
          type: "step/end",
          time: now(),
          data: { turn, step, reason: "completed" },
        },
        {
          type: "turn/end",
          time: now(),
          data: { turn, reason: { kind: "completed" } },
        },
      ], { durability: "flushed" });
      return { sessionId, ...result };
    },
  };
  return capability;
}
