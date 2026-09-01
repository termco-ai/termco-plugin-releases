import { describe, expect, it } from "vitest";
import {
  SESSION_FORMAT_VERSION,
  parseSessionEvent,
  parseSessionHeader,
  projectCanonicalSession,
  projectTrajectory,
  projectCompactionPolicy,
  SessionRevision,
  type BoundaryResolutionResult,
  type ForkSessionInput,
  type ParsedSessionEvent,
  type SessionHeader,
  type SessionQueryResult,
  type SessionWindow,
} from "./index";

const time = 1_777_777_777_777;

const header: SessionHeader = parseSessionHeader({
  formatVersion: SESSION_FORMAT_VERSION,
  id: "session-1",
  createdAt: time,
  authority: "v2",
  backend: "chat",
  fidelity: "full",
});

describe("current compaction policy projection", () => {
  it("derives policy from typed events and counts later completed turns", () => {
    const events = [
      event("compaction/policy", 1, {
        declined: false,
        reason: "success",
        health: { consecutiveFailures: 0, turnsSinceCompact: 0, rapidRefills: 1 },
      }),
      event("turn/start", 2, { turn: 1, cause: "user" }),
      event("turn/end", 3, { turn: 1, reason: { kind: "completed" } }),
    ];
    expect(projectCompactionPolicy(events)).toEqual({
      declined: false,
      health: { consecutiveFailures: 0, turnsSinceCompact: 1, rapidRefills: 1 },
    });
  });
});

function event(
  type: string,
  seq: number,
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): ParsedSessionEvent {
  return parseSessionEvent({ type, seq, time: time + seq, data, ...extra });
}

function fixture(): readonly ParsedSessionEvent[] {
  return [
    event("turn/start", 0, { turn: 1, cause: "user" }),
    event(
      "user/message",
      1,
      { turn: 1, message: { role: "user", content: "hello" }, source: "human" },
      { surfaceOp: { op: "append" } },
    ),
    event("step/start", 2, { turn: 1, step: 1 }),
    event("request/header", 3, {
      turn: 1,
      step: 1,
      requestId: "request-1",
      reason: "initial",
      header: {
        selectedModelId: "model",
        providerRoute: "test",
        providerModelId: "provider/model",
        maxOutputTokens: 8_192,
        systemPrompt: "system",
        messages: [{ role: "user", content: "hello" }],
        tools: [],
        activeTools: [],
        maxSteps: 8,
        approvalPolicy: { mode: "ask" },
      },
    }),
    event("request/context", 4, {
      requestId: "request-1",
      providerRoute: "test",
      providerModelId: "provider/model",
      selectedModelId: "model",
      contextWindow: 100_000,
      maxOutputTokens: 8_192,
    }),
    event("request/attempt", 5, { requestId: "request-1", attempt: 1 }),
    event("assistant/chunk", 6, {
      turn: 1,
      step: 1,
      requestId: "request-1",
      chunk: { kind: "text-delta", text: "hi" },
    }),
    event(
      "assistant/message",
      7,
      {
        turn: 1,
        step: 1,
        requestId: "request-1",
        message: { role: "assistant", content: "hi" },
        usage: { inputTokens: 5, outputTokens: 2, reasoningTokens: 1 },
        performance: { requestStartedAt: time + 3, endedAt: time + 7 },
        finishReason: "stop",
      },
      { surfaceOp: { op: "append" }, sourceEventSeqs: [6] },
    ),
    event("step/end", 8, { turn: 1, step: 1, reason: "completed" }),
    event("turn/end", 9, { turn: 1, reason: { kind: "completed" } }),
  ];
}

describe("canonical session projections", () => {
  it("projects Chat, live-agent, trajectory, and causality from one fixture", () => {
    const projected = projectCanonicalSession(header, fixture());

    expect(projected.chat.messages).toEqual([
      expect.objectContaining({ id: "session-1:event:1", role: "user", eventSeq: 1 }),
      expect.objectContaining({ id: "session-1:event:7", role: "assistant", eventSeq: 7 }),
    ]);
    expect(projected.live).toMatchObject({
      status: "idle",
      accumulatedUsage: { inputTokens: 5, outputTokens: 2, reasoningTokens: 1 },
      pendingApprovalIds: [],
      unresolvedCallIds: [],
    });
    expect(projected.trajectory.records[0]).toMatchObject({
      id: "session-1:header",
      kind: "session/header",
    });
    expect(projected.trajectory.records.find((record) => record.id === "session-1:event:7")).toMatchObject({
      id: "session-1:event:7",
      kind: "assistant/response",
    });
    expect(projected.causal.currentSeqs).toEqual([1, 7]);
    expect(projected.causal.sourcesByDerived[7]).toEqual([6]);
  });

  it("produces identical semantic outputs after a JSON round trip", () => {
    const before = projectCanonicalSession(header, fixture());
    const serialized = JSON.stringify({ header, events: fixture() });
    const raw = JSON.parse(serialized) as { header: unknown; events: unknown[] };
    const roundTrippedHeader = parseSessionHeader(raw.header);
    const roundTrippedEvents = raw.events.map((item) => parseSessionEvent(item));

    expect(projectCanonicalSession(roundTrippedHeader, roundTrippedEvents)).toEqual(before);
  });

  it("keeps trajectory record IDs stable when earlier events are not in the page", () => {
    const events = fixture();
    const full = projectTrajectory(header, events);
    const laterPage = projectTrajectory(header, events.slice(5));
    const fullAssistant = full.records.find((record) => record.id === "session-1:event:7");
    const pagedAssistant = laterPage.records.find((record) => record.id === "session-1:event:7");

    expect(pagedAssistant?.id).toBe(fullAssistant?.id);
    expect(pagedAssistant?.sourceSeqs).toEqual(fullAssistant?.sourceSeqs);
  });

  it("projects lifecycle duration, outcome, and operator-readable summaries", () => {
    const events = [
      event("turn/start", 0, { turn: 1, cause: "user" }),
      event("step/start", 1, { turn: 1, step: 1 }),
      event("request/header", 2, {
        turn: 1,
        step: 1,
        requestId: "request-1",
        reason: "initial",
        header: {
          selectedModelId: "selected-model",
          providerRoute: "openai-compatible",
          providerModelId: "wire-model",
          systemPrompt: "system",
          messages: [],
          tools: [],
          activeTools: [],
          maxSteps: 100,
          approvalPolicy: { mode: "ask" },
        },
      }),
      event("tool/call", 3, {
        turn: 1,
        step: 1,
        requestId: "request-1",
        callId: "call-1",
        name: "read_file",
        rawArguments: "{}",
        contributor: { pluginId: "files", contributionId: "read" },
        concurrency: "exclusive",
      }),
      event("tool/result", 4, {
        turn: 1,
        step: 1,
        callId: "call-1",
        canonicalOutput: { ok: true },
        modelContent: { role: "tool", content: { ok: true } },
        timing: { startedAt: time + 3, endedAt: time + 9 },
      }, { surfaceOp: { op: "append" } }),
      event("assistant/message", 5, {
        turn: 1,
        step: 1,
        requestId: "request-1",
        message: { id: "assistant-1", role: "assistant", parts: [] },
        usage: { inputTokens: 10, outputTokens: 4 },
        performance: { requestStartedAt: time + 2, endedAt: time + 12 },
        finishReason: "stop",
      }, { surfaceOp: { op: "append" } }),
      event("step/end", 6, { turn: 1, step: 1, reason: "completed" }),
      event("turn/end", 7, { turn: 1, reason: { kind: "completed" } }),
    ];

    const projected = projectTrajectory(header, events).records;

    expect(projected.find((record) => record.id === "session-1:event:0")).toMatchObject({
      time: { start: time, end: time + 7 },
      status: "completed",
      summary: "Turn 1 · completed",
      sourceSeqs: [0, 7],
    });
    expect(projected.find((record) => record.id === "session-1:event:2")).toMatchObject({
      time: { start: time + 2, end: time + 12 },
      status: "completed",
      summary: "selected-model via openai-compatible",
      metrics: { inputTokens: 10, outputTokens: 4 },
      sourceSeqs: [2, 5],
    });
    expect(projected.find((record) => record.id === "session-1:event:3")).toMatchObject({
      time: { start: time + 3, end: time + 9 },
      status: "completed",
      summary: "read_file",
      sourceSeqs: [3, 4],
      provenance: { pluginId: "files", contributionId: "read" },
    });
  });

  it("exposes window, query, fork, and boundary contracts without positional identity", () => {
    const events = fixture();
    const window: SessionWindow = {
      header,
      events,
      revision: SessionRevision(1),
      loadedRange: { start: 0, end: 9 },
      availability: { earlier: false, later: false },
      fidelity: "full",
      repair: { state: "healthy" },
    };
    const query: SessionQueryResult = {
      sessionId: header.id,
      eventSeq: events[7]!.seq,
      stableId: "session-1:event:7",
      summary: "assistant response",
      matchedText: "hi",
    };
    const fork: ForkSessionInput = {
      sessionId: header.id,
      boundary: { kind: "completed-turn", turn: 1 },
    };
    const boundary: BoundaryResolutionResult = {
      requested: fork.boundary,
      resolvedSeq: events[9]!.seq,
      seedLength: 10,
      structuralState: "balanced",
    };

    expect(window.loadedRange).toEqual({ start: 0, end: 9 });
    expect(query.stableId).toBe("session-1:event:7");
    expect(boundary).toMatchObject({ resolvedSeq: 9, seedLength: 10 });
  });
});
