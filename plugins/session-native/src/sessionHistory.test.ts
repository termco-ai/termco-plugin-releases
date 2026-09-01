import { describe, expect, it } from "vitest";
import {
  SESSION_FORMAT_VERSION,
  RequestId,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
  type SessionHeader,
  type SessionHistoryCapability,
  type AppendSessionEvent,
} from "@termco/session-base";
import { createInMemorySessionHistory } from "./index";

function header(id = "session-a", createdAt = 1_700_000_000_000): SessionHeader {
  return {
    formatVersion: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt,
    authority: "v2",
    backend: "test",
    fidelity: "full",
    workspace: { rootHash: "workspace-a" },
  };
}

function titleEvent(title: string, time: number): AppendSessionEvent<"session/title"> {
  return {
    type: "session/title",
    time,
    data: { title, source: "user" },
  };
}

describe("in-memory session history capability", () => {
  it("creates a session with an immutable detached header", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    const input = header();

    const snapshot = await history.create({ header: input });
    (input as { backend: string }).backend = "mutated-by-caller";

    expect(snapshot).toEqual({
      header: header(),
      revision: 0,
      tailSeq: undefined,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.header)).toBe(true);
    expect((await history.readWindow(SessionId("session-a"), { kind: "head", limit: 1 })).header.backend)
      .toBe("test");
  });

  it("creates a seeded session atomically with store-owned sequences", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();

    const snapshot = await history.create({
      header: header(),
      seed: [titleEvent("Seed one", 1), titleEvent("Seed two", 2)],
    });
    const window = await history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 });

    expect(snapshot).toMatchObject({ revision: 0, tailSeq: 1 });
    expect(window.events).toEqual([
      { ...titleEvent("Seed one", 1), seq: 0 },
      { ...titleEvent("Seed two", 2), seq: 1 },
    ]);
    expect(window.revision).toBe(0);
  });

  it("lists sessions by current-format update time with title and revision metadata", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header("empty", 100) });
    await history.create({ header: header("active", 50) });
    await history.append(SessionId("active"), [titleEvent("Current title", 300)]);

    const page = await history.list();

    expect(page).toEqual({
      sessions: [
        {
          sessionId: "active",
          createdAt: 50,
          updatedAt: 300,
          backend: "test",
          fidelity: "full",
          revision: 1,
          tailSeq: 0,
          title: "Current title",
          health: "healthy",
        },
        {
          sessionId: "empty",
          createdAt: 100,
          updatedAt: 100,
          backend: "test",
          fidelity: "full",
          revision: 0,
          health: "healthy",
        },
      ],
      exhausted: true,
    });
    expect(Object.isFrozen(page.sessions)).toBe(true);
  });

  it("filters listings by the current rig event instead of immutable creation metadata", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: { ...header(), rigId: "rig-a" } });
    await history.append(SessionId("session-a"), [{
      type: "session/rig",
      time: 10,
      data: { rigId: "rig-b", source: "user" },
    }]);

    await expect(history.list({ rigId: "rig-a" })).resolves.toMatchObject({
      sessions: [],
    });
    await expect(history.list({ rigId: "rig-b" })).resolves.toMatchObject({
      sessions: [{ sessionId: "session-a", rigId: "rig-b" }],
    });
  });

  it("inspects and flushes the exact committed revision without mutation", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [titleEvent("Committed", 10)]);

    await expect(history.inspect(SessionId("session-a"))).resolves.toEqual({
      sessionId: "session-a",
      state: "healthy",
      revision: 1,
      tailSeq: 0,
      safeThroughSeq: 0,
    });
    await expect(history.flush(SessionId("session-a"))).resolves.toBe(1);
    await expect(history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 }))
      .resolves.toMatchObject({ revision: 1 });
  });

  it("keeps a durably paused interactive turn waiting until the user responds", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [
      { type: "turn/start", time: 10, data: { turn: TurnId(1), cause: "user" } },
      { type: "step/start", time: 11, data: { turn: TurnId(1), step: StepId(1) } },
      {
        type: "request/header",
        time: 12,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-a"),
          reason: "initial",
          header: {
            selectedModelId: "model-a",
            providerRoute: "test",
            providerModelId: "model-a",
            systemPrompt: "system",
            messages: [],
            tools: [],
            activeTools: ["ask_ui"],
            maxSteps: 8,
            approvalPolicy: { mode: "ask" },
          },
        },
      },
      {
        type: "tool/call",
        time: 13,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-a"),
          callId: ToolCallId("call-a"),
          name: "ask_ui",
          rawArguments: "{}",
          parsedInput: {},
          contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
          concurrency: "exclusive",
        },
      },
      {
        type: "assistant/message",
        time: 14,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-a"),
          message: {
            id: "assistant-a",
            role: "assistant",
            parts: [{
              type: "tool-ask_ui",
              toolCallId: "call-a",
              state: "input-available",
              input: {},
            }],
          },
          finishReason: "tool-calls",
        },
        surfaceOp: { op: "append" },
      },
      {
        type: "turn/suspend",
        time: 15,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          reason: "human-input",
          callIds: [ToolCallId("call-a")],
          approvalIds: [],
        },
      },
    ]);

    const inspection = await history.inspect(SessionId("session-a"));
    expect(inspection.state).toBe("waiting-input");
    expect(inspection).not.toHaveProperty("proposedRepair");
    await expect(history.loadForContinuation(SessionId("session-a"))).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({ type: "assistant/message", seq: SessionSeq(4) }),
        expect.objectContaining({ type: "turn/suspend", seq: SessionSeq(5) }),
      ]),
      repair: { state: "waiting-input" },
    });
    const window = await history.readWindow(SessionId("session-a"), {
      kind: "head",
      limit: 10,
    });
    expect(window.events).toHaveLength(6);
    expect(window.repair).toEqual({ state: "waiting-input" });
  });

  it("allocates sequences and one revision for an atomic append batch", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    const first = titleEvent("First", 10);
    const second = titleEvent("Second", 11);

    const committed = await history.append(SessionId("session-a"), [first, second]);
    (first.data as { title: string }).title = "mutated-by-caller";
    const window = await history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 });

    expect(committed).toEqual({
      sessionId: "session-a",
      firstSeq: 0,
      lastSeq: 1,
      revision: 1,
      durability: "memory",
    });
    expect(window.events).toEqual([
      { ...titleEvent("First", 10), seq: 0 },
      { ...titleEvent("Second", 11), seq: 1 },
    ]);
    expect(window.revision).toBe(1);
    expect(Object.isFrozen(window.events)).toBe(true);
    expect(Object.isFrozen(window.events[0])).toBe(true);
  });

  it("validates the whole append batch before committing any sequence", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    const invalid: readonly AppendSessionEvent[] = [
      { type: "turn/start", time: 1, data: { turn: TurnId(1), cause: "user" } },
      { type: "turn/start", time: 2, data: { turn: TurnId(2), cause: "followup" } },
    ];

    await expect(history.append(SessionId("session-a"), invalid))
      .rejects.toMatchObject({ code: "INVARIANT_VIOLATION" });
    await expect(history.append(SessionId("session-a"), [titleEvent("First valid", 3)]))
      .resolves.toMatchObject({ firstSeq: 0, lastSeq: 0, revision: 1 });
  });

  it("rejects stale revision or tail preconditions without committing", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [titleEvent("Committed", 10)]);

    await expect(history.append(
      SessionId("session-a"),
      [titleEvent("Stale revision", 11)],
      { expectedRevision: SessionRevision(0) },
    )).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(history.append(
      SessionId("session-a"),
      [titleEvent("Stale tail", 12)],
      { expectedTailSeq: SessionSeq(99) },
    )).rejects.toMatchObject({ code: "TAIL_CONFLICT" });

    const window = await history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 });
    expect(window.events.map((event) => event.data)).toEqual([
      { title: "Committed", source: "user" },
    ]);
    expect(window.revision).toBe(1);
  });

  it("delivers every committed batch once after commit and isolates listener failures", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    const observed: Array<{ revision: number; seqs: number[] }> = [];
    const visibilityChecks: Array<Promise<number>> = [];
    history.subscribe(SessionId("session-a"), () => {
      throw new Error("broken listener");
    });
    history.subscribe(SessionId("session-a"), (commit) => {
      observed.push({
        revision: commit.revision as number,
        seqs: commit.events.map((event) => event.seq as number),
      });
      visibilityChecks.push(
        history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 })
          .then((window) => window.events.length),
      );
    });

    await history.append(SessionId("session-a"), [titleEvent("First", 10)]);
    await history.append(SessionId("session-a"), [titleEvent("Second", 11)]);

    expect(observed).toEqual([
      { revision: 1, seqs: [0] },
      { revision: 2, seqs: [1] },
    ]);
    expect(await Promise.all(visibilityChecks)).toEqual([1, 2]);
  });

  it("reads paged head, tail, before, after, and inclusive range windows", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(
      SessionId("session-a"),
      Array.from({ length: 5 }, (_, index) => titleEvent(`Title ${index}`, 10 + index)),
    );
    const summarize = async (request: Parameters<SessionHistoryCapability["readWindow"]>[1]) => {
      const window = await history.readWindow(SessionId("session-a"), request);
      return {
        seqs: window.events.map((event) => event.seq as number),
        range: window.loadedRange,
        availability: window.availability,
      };
    };

    await expect(summarize({ kind: "head", limit: 2 })).resolves.toEqual({
      seqs: [0, 1], range: { start: 0, end: 1 }, availability: { earlier: false, later: true },
    });
    await expect(summarize({ kind: "tail", limit: 2 })).resolves.toEqual({
      seqs: [3, 4], range: { start: 3, end: 4 }, availability: { earlier: true, later: false },
    });
    await expect(summarize({ kind: "before", seq: SessionSeq(3), limit: 2 })).resolves.toEqual({
      seqs: [1, 2], range: { start: 1, end: 2 }, availability: { earlier: true, later: true },
    });
    await expect(summarize({ kind: "after", seq: SessionSeq(1), limit: 2 })).resolves.toEqual({
      seqs: [2, 3], range: { start: 2, end: 3 }, availability: { earlier: true, later: true },
    });
    await expect(summarize({ kind: "range", start: SessionSeq(1), end: SessionSeq(3) })).resolves.toEqual({
      seqs: [1, 2, 3], range: { start: 1, end: 3 }, availability: { earlier: true, later: true },
    });
  });

  it("removes only the expected revision and drains that session's subscribers", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [titleEvent("Committed", 10)]);
    let deliveries = 0;
    history.subscribe(SessionId("session-a"), () => {
      deliveries += 1;
    });

    await expect(history.remove(SessionId("session-a"), {
      expectedRevision: SessionRevision(0),
    })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(history.readWindow(SessionId("session-a"), { kind: "head", limit: 1 }))
      .resolves.toMatchObject({ revision: 1 });

    await history.remove(SessionId("session-a"), { expectedRevision: SessionRevision(1) });
    await expect(history.readWindow(SessionId("session-a"), { kind: "head", limit: 1 }))
      .rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });

    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [titleEvent("New instance", 20)]);
    expect(deliveries).toBe(0);
  });

  it("serializes concurrent callers without duplicate or missing sequences", async () => {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const history: SessionHistoryCapability = createInMemorySessionHistory();
      const id = SessionId(`concurrent-${iteration}`);
      await history.create({ header: header(id) });
      const commits = await Promise.all(
        Array.from({ length: 32 }, async (_, index) => {
          for (let delay = 0; delay < (index * 17 + iteration * 7) % 4; delay += 1) {
            await Promise.resolve();
          }
          return history.append(id, [titleEvent(`Title ${index}`, index)]);
        }),
      );
      const window = await history.readWindow(id, { kind: "head", limit: 100 });

      expect(window.events.map((event) => event.seq as number)).toEqual(
        Array.from({ length: 32 }, (_, index) => index),
      );
      expect(commits.map((commit) => commit.revision as number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 32 }, (_, index) => index + 1),
      );
    }
  });

  it("evaluates concurrent expected revisions inside the serialized commit lane", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });

    const results = await Promise.allSettled([
      history.append(SessionId("session-a"), [titleEvent("First", 10)], {
        expectedRevision: SessionRevision(0),
      }),
      history.append(SessionId("session-a"), [titleEvent("Second", 11)], {
        expectedRevision: SessionRevision(0),
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "REVISION_CONFLICT" },
    });
    expect((await history.readWindow(SessionId("session-a"), { kind: "head", limit: 10 })).events)
      .toHaveLength(1);
  });

  it("forks a completed turn transactionally without changing the parent", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [
      titleEvent("Parent", 1),
      { type: "turn/start", time: 2, data: { turn: TurnId(1), cause: "user" } },
      { type: "turn/end", time: 3, data: { turn: TurnId(1), reason: { kind: "completed" } } },
      { type: "turn/start", time: 4, data: { turn: TurnId(2), cause: "followup" } },
      titleEvent("Open tail", 5),
    ]);

    const forked = await history.fork({
      sessionId: SessionId("session-a"),
      boundary: { kind: "event", seq: SessionSeq(4) },
      title: "Child",
      origin: "fork",
    });
    const child = await history.readWindow(forked.childSessionId, { kind: "head", limit: 20 });
    const parent = await history.readWindow(SessionId("session-a"), { kind: "head", limit: 20 });

    expect(forked).toMatchObject({
      parentSessionId: "session-a",
      boundary: {
        requested: { kind: "event", seq: 4 },
        resolvedSeq: 2,
        seedLength: 3,
        structuralState: "repaired",
      },
      revision: 0,
    });
    expect(child.header).toMatchObject({
      parent: { sessionId: "session-a", boundarySeq: 2, seedLength: 3 },
      origin: "fork",
    });
    expect(child.events.map((event) => event.type)).toEqual([
      "session/title",
      "turn/start",
      "turn/end",
      "session/end-seed",
      "session/title",
    ]);
    expect(parent.events).toHaveLength(5);
  });

  it("refuses to remove a parent until every canonical child is removed", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header() });
    await history.append(SessionId("session-a"), [titleEvent("Parent", 1)]);
    const child = await history.fork({
      sessionId: SessionId("session-a"),
      boundary: { kind: "event", seq: SessionSeq(0) },
    });

    await expect(history.remove(SessionId("session-a"))).rejects.toMatchObject({
      code: "SESSION_REFERENCED",
    });
    await history.remove(child.childSessionId);
    await expect(history.remove(SessionId("session-a"))).resolves.toBeUndefined();
  });

  it("reports expired current sessions without mutating them during retention dry runs", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header("expired", 10) });
    await history.create({ header: header("current", 200) });

    await expect(history.enforceRetention({
      deleteUpdatedBefore: 100,
      dryRun: true,
    })).resolves.toEqual({
      protected: [{ sessionId: "current", protections: ["recent"] }],
      eligibleSessionIds: ["expired"],
      removedSessionIds: [],
    });
    await expect(history.readWindow(SessionId("expired"), { kind: "head", limit: 1 }))
      .resolves.toMatchObject({ header: { id: "expired" } });
  });

  it("retains active, open, pinned, recent, and referenced sessions while pruning expired leaves", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header("expired", 10) });
    await history.create({ header: header("pinned", 20) });
    await history.append(SessionId("pinned"), [{
      type: "session/pin",
      time: 20,
      data: { pinned: true },
    }]);
    await history.create({ header: header("open", 30) });
    await history.append(SessionId("open"), [{
      type: "turn/start",
      time: 30,
      data: { turn: TurnId(1), cause: "user" },
    }]);
    await history.create({ header: header("active", 40) });
    await history.create({ header: header("ancestor", 50) });
    await history.create({
      header: {
        ...header("recent-child", 200),
        parent: {
          sessionId: SessionId("ancestor"),
          boundarySeq: SessionSeq(0),
          seedLength: 0,
        },
        origin: "fork",
      },
    });
    await history.create({ header: header("current", 300) });

    await expect(history.enforceRetention({
      deleteUpdatedBefore: 100,
      activeSessionIds: [SessionId("active")],
    })).resolves.toEqual({
      protected: [
        { sessionId: "current", protections: ["recent"] },
        { sessionId: "recent-child", protections: ["recent"] },
        { sessionId: "ancestor", protections: ["referenced"] },
        { sessionId: "active", protections: ["active"] },
        { sessionId: "open", protections: ["open"] },
        { sessionId: "pinned", protections: ["pinned"] },
      ],
      eligibleSessionIds: ["expired"],
      removedSessionIds: ["expired"],
    });
    await expect(history.readWindow(SessionId("expired"), { kind: "head", limit: 1 }))
      .rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
  });

  it("makes an expired session eligible again when its canonical pin is cleared", async () => {
    const history: SessionHistoryCapability = createInMemorySessionHistory();
    await history.create({ header: header("session-a", 10) });
    await history.append(SessionId("session-a"), [{
      type: "session/pin",
      time: 20,
      data: { pinned: true },
    }]);

    await expect(history.enforceRetention({
      deleteUpdatedBefore: 100,
      dryRun: true,
    })).resolves.toMatchObject({
      protected: [{ sessionId: "session-a", protections: ["pinned"] }],
      eligibleSessionIds: [],
    });

    await history.append(SessionId("session-a"), [{
      type: "session/pin",
      time: 21,
      data: { pinned: false },
    }]);
    await expect(history.enforceRetention({ deleteUpdatedBefore: 100 })).resolves.toMatchObject({
      protected: [],
      eligibleSessionIds: ["session-a"],
      removedSessionIds: ["session-a"],
    });
  });

  it("drains accepted work and subscribers before rejecting every later call", async () => {
    const history = createInMemorySessionHistory();
    await history.create({ header: header() });
    let deliveries = 0;
    history.subscribe(SessionId("session-a"), () => {
      deliveries += 1;
    });

    const accepted = history.append(SessionId("session-a"), [titleEvent("Accepted", 10)]);
    const disposal = history.dispose();

    await expect(accepted).resolves.toMatchObject({ firstSeq: 0, lastSeq: 0, revision: 1 });
    await disposal;
    expect(deliveries).toBe(0);
    await expect(history.create({ header: header("later") })).rejects.toMatchObject({ code: "DISPOSED" });
    await expect(history.append(SessionId("session-a"), [titleEvent("Later", 11)]))
      .rejects.toMatchObject({ code: "DISPOSED" });
    await expect(history.readWindow(SessionId("session-a"), { kind: "head", limit: 1 }))
      .rejects.toMatchObject({ code: "DISPOSED" });
    expect(() => history.subscribe(SessionId("session-a"), () => undefined))
      .toThrow(expect.objectContaining({ code: "DISPOSED" }));
  });
});
