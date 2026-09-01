import { describe, expect, it } from "vitest";
import {
  SESSION_FORMAT_VERSION,
  CORE_SESSION_EVENT_TYPES,
  SessionContractError,
  createSessionHistoryValidator,
  parseAppendSessionEvent,
  parseSessionEvent,
  parseSessionHeader,
  validateSessionHistory,
} from "./index";

const time = 1_777_777_777_777;

function envelope(
  type: string,
  data: unknown,
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return { type, seq: 0, time, data, ...extra };
}

const contributor = { pluginId: "test-plugin", revision: "1" };
const failure = { name: "ProviderError", code: "unavailable", message: "offline" };
const requestHeader = {
  selectedModelId: "model",
  providerRoute: "test",
  providerModelId: "provider/model",
  systemPrompt: "system",
  messages: [],
  tools: [],
  activeTools: [],
  maxSteps: 8,
  approvalPolicy: { mode: "ask" },
};

const coreFixtures: readonly Record<string, unknown>[] = [
  envelope("session/end-seed", {}),
  envelope("session/title", { title: "Title", source: "user", sourceEventSeqs: [] }),
  envelope("session/policy", { approval: "ask", sandbox: "workspace", source: "user" }),
  envelope("session/pin", { pinned: true }),
  envelope("session/label", { label: "important", operation: "add" }),
  envelope("session/rig", { rigId: "rig-2", source: "user" }),
  envelope("turn/start", { turn: 1, cause: "user" }),
  envelope("turn/suspend", {
    turn: 1,
    step: 1,
    reason: "human-input",
    callIds: ["call-1"],
    approvalIds: [],
  }),
  envelope("turn/resume", { turn: 1, step: 1, cause: "response" }),
  envelope("turn/end", { turn: 1, reason: { kind: "completed" } }),
  envelope("step/start", { turn: 1, step: 1 }),
  envelope("step/end", { turn: 1, step: 1, reason: "completed" }),
  envelope(
    "user/message",
    { turn: 1, message: { role: "user", content: "hello" }, source: "human" },
    { surfaceOp: { op: "append" } },
  ),
  envelope("context/injected", {
    turn: 1,
    step: 1,
    kind: "environment",
    content: { text: "context" },
    contributor,
    modelVisible: true,
  }),
  envelope("request/header", {
    turn: 1,
    step: 1,
    requestId: "request-1",
    reason: "initial",
    header: requestHeader,
  }),
  envelope("request/context", {
    requestId: "request-1",
    providerRoute: "test",
    providerModelId: "provider/model",
    selectedModelId: "model",
    contextWindow: 100_000,
    maxOutputTokens: 8_192,
    adapterDefaults: {},
  }),
  envelope("request/attempt", { requestId: "request-1", attempt: 1 }),
  envelope("request/failure", { requestId: "request-1", attempt: 1, failure }),
  envelope("assistant/chunk", {
    turn: 1,
    step: 1,
    requestId: "request-1",
    chunk: { kind: "text-delta", text: "hello" },
  }),
  envelope(
    "assistant/message",
    {
      turn: 1,
      step: 1,
      requestId: "request-1",
      message: { role: "assistant", content: "hello" },
      usage: { inputTokens: 10, outputTokens: 2 },
      performance: { requestStartedAt: time, endedAt: time + 5 },
      finishReason: "stop",
    },
    { seq: 1, surfaceOp: { op: "append" }, sourceEventSeqs: [0] },
  ),
  envelope("tool/call", {
    turn: 1,
    step: 1,
    requestId: "request-1",
    callId: "call-1",
    name: "read_file",
    rawArguments: "{}",
    parsedInput: {},
    contributor,
    concurrency: "safe",
  }),
  envelope("approval/request", {
    approvalId: "approval-1",
    callId: "call-1",
    policy: { mode: "ask" },
    reason: { kind: "tool-policy" },
  }),
  envelope("approval/decision", {
    approvalId: "approval-1",
    callId: "call-1",
    outcome: "allowed-once",
    responder: "user",
  }),
  envelope(
    "tool/result",
    {
      turn: 1,
      step: 1,
      callId: "call-1",
      canonicalOutput: { content: "file" },
      modelContent: { role: "tool", content: "file" },
      presentation: { kind: "text" },
      timing: { startedAt: time, endedAt: time + 2 },
    },
    { seq: 1, surfaceOp: { op: "append" }, sourceEventSeqs: [0] },
  ),
  envelope("retry/scheduled", {
    retryId: "retry-1",
    requestId: "request-1",
    previousAttempt: 1,
    nextAttempt: 2,
    delayMs: 100,
    reason: failure,
  }),
  envelope("retry/started", { retryId: "retry-1", requestId: "request-1", attempt: 2 }),
  envelope("retry/cancelled", { retryId: "retry-1", reason: { kind: "user" } }),
  envelope("compaction/start", {
    compactionId: "compact-1",
    trigger: "automatic",
    measuredTokens: 90_000,
    candidate: { start: 1, end: 5 },
    policyRevision: "1",
  }),
  envelope("compaction/summary", {
    compactionId: "compact-1",
    request: { modelId: "summary-model" },
    summary: { text: "summary" },
  }),
  envelope(
    "compaction/message",
    { compactionId: "compact-1", content: { text: "summary" } },
    { seq: 6, surfaceOp: { op: "replace", start: 1, end: 5 }, sourceEventSeqs: [1, 2, 3, 4, 5] },
  ),
  envelope("compaction/end", { compactionId: "compact-1", outcome: "succeeded" }),
  envelope("compaction/policy", {
    declined: false,
    reason: "success",
    health: { consecutiveFailures: 0, turnsSinceCompact: 0, rapidRefills: 0 },
  }),
  envelope("workspace/checkpoint", {
    checkpointId: "checkpoint-1",
    backend: "git",
    reference: { sha: "abc" },
    summary: "before edit",
  }),
  envelope("subagent/start", { childSessionId: "child-1", request: { task: "inspect" } }),
  envelope("subagent/report", {
    childSessionId: "child-1",
    content: { text: "done" },
    sourceEventSeqs: [],
  }),
  envelope("subagent/end", { childSessionId: "child-1", outcome: "completed" }),
  envelope("adapter/event", { adapter: "coding-agent", kind: "progress", payload: {} }),
];

describe("session runtime contracts", () => {
  it("validates only newly appended canonical events and rolls back a rejected batch", () => {
    let visited = 0;
    const validator = createSessionHistoryValidator({
      invariantCompanions: [() => {
        visited += 1;
      }],
    });

    for (let seq = 0; seq < 100; seq += 1) {
      validator.append([envelope("session/title", {
        title: `Title ${seq}`,
        source: "user",
      }, { seq })]);
    }

    expect(visited).toBe(100);
    expect(validator.report()).toMatchObject({ eventCount: 100, lastSeq: 99 });
    expect(() => validator.append([
      envelope("session/title", { title: "Gap", source: "user" }, { seq: 101 }),
    ])).toThrowError(expect.objectContaining({ code: "INVARIANT_VIOLATION" }));
    validator.append([
      envelope("session/title", { title: "Recovered", source: "user" }, { seq: 100 }),
    ]);
    expect(visited).toBe(101);
    expect(validator.report()).toMatchObject({ eventCount: 101, lastSeq: 100 });
  });

  it("parses valid headers and rejects unsupported or contradictory headers", () => {
    const valid = {
      formatVersion: SESSION_FORMAT_VERSION,
      id: "session-1",
      createdAt: time,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    };

    expect(parseSessionHeader(valid)).toEqual(valid);
    expect(() => parseSessionHeader({ ...valid, formatVersion: 1 })).toThrowError(
      expect.objectContaining({ code: "FORMAT_UNSUPPORTED", path: "header.formatVersion" }),
    );
    expect(() =>
      parseSessionHeader({
        ...valid,
        parent: { sessionId: "parent", boundarySeq: 2, seedLength: -1 },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_HEADER", path: "header.parent.seedLength" }));
    expect(() => parseSessionHeader({ ...valid, authority: "unsupported" })).toThrowError(
      expect.objectContaining({ code: "INVALID_HEADER", path: "header.authority" }),
    );
    expect(() => parseSessionHeader({ ...valid, sourceFormat: 1 })).toThrowError(
      expect.objectContaining({ code: "INVALID_HEADER", path: "header.sourceFormat" }),
    );
  });

  it("accepts every core event variant and rejects invalid data for every variant", () => {
    expect(coreFixtures.map((fixture) => fixture.type).sort()).toEqual(
      [...CORE_SESSION_EVENT_TYPES].sort(),
    );
    for (const fixture of coreFixtures) {
      expect(parseSessionEvent(fixture)).toMatchObject({ type: fixture.type });
      expect(() => parseSessionEvent({ ...fixture, data: null })).toThrowError(SessionContractError);
      if (fixture.type !== "session/end-seed") {
        expect(() => parseSessionEvent({ ...fixture, data: {} })).toThrowError(SessionContractError);
      }
    }
    expect(() => parseSessionEvent(envelope("session/end-seed", { unexpected: true }))).toThrowError(
      expect.objectContaining({ code: "INVALID_EVENT", path: "event.data" }),
    );
  });

  it("rejects non-lossless JSON with a precise path", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const invalidValues = [undefined, Number.POSITIVE_INFINITY, () => undefined, new Date(), cyclic];

    for (const value of invalidValues) {
      expect(() =>
        parseSessionEvent(envelope("adapter/event", { adapter: "test", kind: "value", payload: value })),
      ).toThrowError(expect.objectContaining({ code: "INVALID_JSON" }));
    }
  });

  it("rejects unknown required events but preserves unknown ignorable records", () => {
    expect(() => parseSessionEvent(envelope("plugin/required", {}))).toThrowError(
      expect.objectContaining({ code: "UNKNOWN_REQUIRED_EVENT", path: "event.type" }),
    );

    expect(parseSessionEvent(envelope("plugin/info", { value: 1 }, { ignorable: true }))).toEqual(
      envelope("plugin/info", { value: 1 }, { ignorable: true }),
    );

    expect(
      parseSessionEvent(envelope("plugin/registered", { value: 1 }), {
        extensions: {
          "plugin/registered": {
            validateData(data, path) {
              if (typeof (data as { value?: unknown }).value !== "number") {
                throw new SessionContractError({ code: "INVALID_EVENT", message: "value is required", path });
              }
            },
          },
        },
      }),
    ).toMatchObject({ type: "plugin/registered", data: { value: 1 } });
  });

  it("keeps live append intents separate from privileged committed events", () => {
    const intent = {
      type: "session/title",
      time,
      data: { title: "New title", source: "user" },
    };
    expect(parseAppendSessionEvent(intent)).toEqual(intent);
    expect(() => parseAppendSessionEvent({ ...intent, seq: 4 })).toThrowError(
      expect.objectContaining({ code: "INVALID_EVENT", path: "event.seq" }),
    );
  });

  it("enforces conditional surface fields and source causality", () => {
    const user = coreFixtures.find((fixture) => fixture.type === "user/message")!;
    expect(() => parseSessionEvent({ ...user, surfaceOp: undefined })).toThrowError(
      expect.objectContaining({ code: "INVALID_EVENT", path: "event.surfaceOp" }),
    );
    expect(() =>
      parseSessionEvent({
        ...coreFixtures.find((fixture) => fixture.type === "turn/start")!,
        surfaceOp: { op: "append" },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EVENT", path: "event.surfaceOp" }));
    expect(() =>
      parseSessionEvent({ ...user, seq: 3, sourceEventSeqs: [1, 3] }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_EVENT", path: "event.sourceEventSeqs[1]" }));
  });

  it("validates balanced turn, step, request, call, approval, and retry relationships", () => {
    const events = [
      envelope("turn/start", { turn: 1, cause: "user" }),
      envelope(
        "user/message",
        { turn: 1, message: { role: "user", content: "hello" }, source: "human" },
        { surfaceOp: { op: "append" } },
      ),
      envelope("step/start", { turn: 1, step: 1 }),
      envelope("request/header", {
        turn: 1,
        step: 1,
        requestId: "request-1",
        reason: "initial",
        header: requestHeader,
      }),
      envelope("request/attempt", { requestId: "request-1", attempt: 1 }),
      coreFixtures.find((fixture) => fixture.type === "tool/call")!,
      coreFixtures.find((fixture) => fixture.type === "approval/request")!,
      coreFixtures.find((fixture) => fixture.type === "approval/decision")!,
      coreFixtures.find((fixture) => fixture.type === "tool/result")!,
      envelope("step/end", { turn: 1, step: 1, reason: "completed" }),
      envelope("turn/end", { turn: 1, reason: { kind: "completed" } }),
    ].map((event, seq) => ({ ...event, seq }));

    expect(validateSessionHistory(events)).toMatchObject({ eventCount: events.length, lastSeq: 10 });

    const invalidHistories = [
      [envelope("step/start", { turn: 1, step: 1 })],
      [
        envelope("turn/start", { turn: 1, cause: "user" }),
        envelope("turn/start", { turn: 2, cause: "user" }),
      ],
      [
        envelope("turn/start", { turn: 1, cause: "user" }),
        envelope("step/start", { turn: 1, step: 1 }),
        envelope("tool/result", {
          turn: 1,
          step: 1,
          callId: "missing",
          canonicalOutput: {},
          modelContent: {},
        }, { surfaceOp: { op: "append" } }),
      ],
      [
        envelope("retry/scheduled", {
          retryId: "retry-1",
          requestId: "missing",
          previousAttempt: 1,
          nextAttempt: 3,
          delayMs: 0,
          reason: failure,
        }),
      ],
      [
        envelope("turn/start", { turn: 1, cause: "user" }),
        envelope("step/start", { turn: 1, step: 1 }),
        envelope("request/header", {
          turn: 1,
          step: 1,
          requestId: "request-1",
          reason: "initial",
          header: requestHeader,
        }),
        envelope("request/attempt", { requestId: "request-1", attempt: 1 }),
        envelope("approval/decision", {
          approvalId: "missing",
          callId: "missing",
          outcome: "rejected",
        }),
      ],
      [
        envelope("turn/start", { turn: 1, cause: "user" }),
        envelope("step/start", { turn: 1, step: 1 }),
        envelope("request/header", {
          turn: 1,
          step: 1,
          requestId: "request-1",
          reason: "initial",
          header: requestHeader,
        }),
        envelope("request/attempt", { requestId: "request-1", attempt: 1 }),
        envelope("retry/scheduled", {
          retryId: "retry-1",
          requestId: "request-1",
          previousAttempt: 1,
          nextAttempt: 3,
          delayMs: 0,
          reason: failure,
        }),
      ],
    ].map((history) => history.map((event, seq) => ({ ...event, seq })));

    for (const history of invalidHistories) {
      expect(() => validateSessionHistory(history)).toThrowError(
        expect.objectContaining({ code: "INVARIANT_VIOLATION" }),
      );
    }
  });

  it("allows an approved suspended call to resume before the executable result arrives", () => {
    const events = [
      envelope("turn/start", { turn: 1, cause: "user" }),
      envelope("step/start", { turn: 1, step: 1 }),
      envelope("request/header", {
        turn: 1,
        step: 1,
        requestId: "request-1",
        reason: "initial",
        header: requestHeader,
      }),
      envelope("request/attempt", { requestId: "request-1", attempt: 1 }),
      coreFixtures.find((fixture) => fixture.type === "tool/call")!,
      coreFixtures.find((fixture) => fixture.type === "approval/request")!,
      envelope("turn/suspend", {
        turn: 1,
        step: 1,
        reason: "human-input",
        callIds: ["call-1"],
        approvalIds: ["approval-1"],
      }),
      coreFixtures.find((fixture) => fixture.type === "approval/decision")!,
      envelope("turn/resume", { turn: 1, step: 1, cause: "response" }),
    ].map((event, seq) => ({ ...event, seq }));

    const report = validateSessionHistory(events);
    expect(report).toMatchObject({
      openTurn: 1,
      openStep: 1,
      unresolvedCallIds: ["call-1"],
      pendingApprovalIds: [],
    });
    expect(report.suspension).toBeUndefined();
  });
});
