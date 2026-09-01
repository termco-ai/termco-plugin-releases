import { describe, expect, it } from "vitest";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionRevision,
  SessionSeq,
  parseSessionEvent,
  parseSessionHeader,
  type ListSessionsRequest,
  type ParsedSessionEvent,
  type SessionHeader,
  type SessionHistoryCapability,
  type SessionListing,
  type SessionQueryCapability,
  type SessionModelQueryCapability,
  type SessionWindowRequest,
} from "@termco/session-base";
import { createModelSessionQuery, createSessionQuery } from "./query";

const now = 1_777_777_777_777;

function header(
  id: string,
  backend = "chat",
  rigId = "rig-1",
  workspaceRootHash: string | null = "workspace-1",
): SessionHeader {
  return parseSessionHeader({
    formatVersion: SESSION_FORMAT_VERSION,
    id,
    createdAt: now,
    authority: "v2",
    backend,
    fidelity: "full",
    rigId,
    ...(workspaceRootHash === null ? {} : { workspace: { rootHash: workspaceRootHash } }),
  });
}

function metadataEvent(seq: number, title: string): ParsedSessionEvent {
  return parseSessionEvent({
    type: "session/title",
    seq,
    time: now + seq,
    data: { title, source: "user" },
  });
}

function causalEvents(): readonly ParsedSessionEvent[] {
  return [
    parseSessionEvent({
      type: "turn/start",
      seq: 0,
      time: now,
      data: { turn: 1, cause: "user" },
    }),
    parseSessionEvent({
      type: "user/message",
      seq: 1,
      time: now + 1,
      data: { turn: 1, message: { role: "user", content: "derived" }, source: "human" },
      surfaceOp: { op: "append" },
      sourceEventSeqs: [0],
    }),
  ];
}

function compactedEvents(): readonly ParsedSessionEvent[] {
  return [
    parseSessionEvent({
      type: "turn/start",
      seq: 0,
      time: now,
      data: { turn: 1, cause: "user" },
    }),
    parseSessionEvent({
      type: "user/message",
      seq: 1,
      time: now + 1,
      data: { turn: 1, message: { role: "user", content: "needle shadowed" }, source: "human" },
      surfaceOp: { op: "append" },
    }),
    parseSessionEvent({
      type: "compaction/start",
      seq: 2,
      time: now + 2,
      data: {
        compactionId: "compaction-1",
        trigger: "automatic",
        measuredTokens: 90_000,
        candidate: { start: 1, end: 1 },
        policyRevision: "1",
      },
    }),
    parseSessionEvent({
      type: "compaction/summary",
      seq: 3,
      time: now + 3,
      data: {
        compactionId: "compaction-1",
        request: { modelId: "summary-model" },
        summary: { text: "needle log" },
      },
    }),
    parseSessionEvent({
      type: "compaction/message",
      seq: 4,
      time: now + 4,
      data: { compactionId: "compaction-1", content: { text: "needle current" } },
      surfaceOp: { op: "replace", start: 1, end: 1 },
      sourceEventSeqs: [1, 2, 3],
    }),
    parseSessionEvent({
      type: "compaction/end",
      seq: 5,
      time: now + 5,
      data: { compactionId: "compaction-1", outcome: "succeeded" },
    }),
  ];
}

function currentExecutingStepEvents(): readonly ParsedSessionEvent[] {
  return [
    parseSessionEvent({
      type: "turn/start",
      seq: 0,
      time: now,
      data: { turn: 1, cause: "user" },
    }),
    metadataEvent(1, "needle before current step"),
    parseSessionEvent({
      type: "step/start",
      seq: 2,
      time: now + 2,
      data: { turn: 1, step: 2 },
    }),
    parseSessionEvent({
      type: "request/header",
      seq: 3,
      time: now + 3,
      data: {
        turn: 1,
        step: 2,
        requestId: "request-1",
        reason: "initial",
        header: {
          selectedModelId: "model-1",
          providerRoute: "test",
          providerModelId: "model-1",
          systemPrompt: "test",
          messages: [],
          tools: [],
          activeTools: [],
          maxSteps: 8,
          approvalPolicy: {},
        },
      },
    }),
    parseSessionEvent({
      type: "tool/call",
      seq: 4,
      time: now + 4,
      data: {
        turn: 1,
        step: 2,
        requestId: "request-1",
        callId: "call-1",
        name: "session_search",
        rawArguments: '{"text":"needle"}',
        contributor: { pluginId: "ai-tools-session-query-native" },
        concurrency: "exclusive",
      },
    }),
    metadataEvent(5, "needle after invoking call"),
  ];
}

function listing(sessionHeader: SessionHeader, tailSeq: number): SessionListing {
  return {
    sessionId: sessionHeader.id,
    createdAt: sessionHeader.createdAt,
    updatedAt: now + tailSeq,
    backend: sessionHeader.backend,
    fidelity: sessionHeader.fidelity,
    revision: SessionRevision(1),
    tailSeq: SessionSeq(tailSeq),
    health: "healthy",
  };
}

function pagedHistory(
  sessions: readonly { readonly header: SessionHeader; readonly events: readonly ParsedSessionEvent[] }[],
): SessionHistoryCapability {
  return {
    async list(request: ListSessionsRequest = {}) {
      const eligible = sessions.filter(
        (session) =>
          (request.rigId === undefined || session.header.rigId === request.rigId) &&
          (request.workspaceRootHash === undefined ||
            session.header.workspace?.rootHash === request.workspaceRootHash),
      );
      const start = request.cursor === undefined
        ? 0
        : eligible.findIndex((session) => session.header.id === request.cursor) + 1;
      const page = eligible.slice(start, start + 1);
      const exhausted = start + page.length >= eligible.length;
      return {
        sessions: page.map((session) => listing(session.header, session.events.length - 1)),
        ...(exhausted || page.length === 0 ? {} : { cursor: String(page[0]!.header.id) }),
        exhausted,
      };
    },
    async readWindow(sessionId: SessionId, request: SessionWindowRequest) {
      const session = sessions.find((candidate) => candidate.header.id === sessionId);
      if (session === undefined) throw new Error(`missing session ${sessionId}`);
      const start = request.kind === "head"
        ? 0
        : request.kind === "after"
          ? Number(request.seq) + 1
          : request.kind === "range"
            ? Number(request.start)
            : 0;
      const limit = request.kind === "range" ? Number(request.end) - start + 1 : 1;
      const events = session.events.slice(start, start + limit);
      const end = start + events.length - 1;
      return {
        header: session.header,
        events,
        revision: SessionRevision(1),
        loadedRange: { start, end },
        availability: { earlier: start > 0, later: end < session.events.length - 1 },
        fidelity: session.header.fidelity,
        repair: { state: "healthy" },
      };
    },
  } as unknown as SessionHistoryCapability;
}

describe("SessionQueryCapability", () => {
  it("skips an explicitly unhealthy session instead of breaking search for healthy sessions", async () => {
    const healthy = header("session-healthy");
    const base = pagedHistory([{
      header: healthy,
      events: [metadataEvent(0, "needle healthy")],
    }]);
    const corruptHeader = header("session-corrupt");
    const history = {
      ...base,
      async list() {
        return {
          sessions: [
            { ...listing(corruptHeader, 0), health: "corrupt-prefix" as const },
            listing(healthy, 0),
          ],
          exhausted: true,
        };
      },
    } as SessionHistoryCapability;
    const query = createSessionQuery(history);

    await expect(query.search({ text: "needle" })).resolves.toMatchObject({
      results: [{ sessionId: "session-healthy" }],
      exhausted: true,
    });
  });

  it("searches canonical semantic records across paged session history", async () => {
    const first = header("session-1");
    const second = header("session-2");
    const history = pagedHistory([
      { header: first, events: [metadataEvent(0, "ordinary title")] },
      {
        header: second,
        events: [metadataEvent(0, "ordinary title"), metadataEvent(1, "Needle in semantic data")],
      },
    ]);
    const query: SessionQueryCapability = createSessionQuery(history);

    await expect(query.search({ text: "needle" })).resolves.toMatchObject({
      results: [
        {
          sessionId: SessionId("session-2"),
          eventSeq: SessionSeq(1),
          stableId: "session-2:event:1",
          summary: "session/title",
          matchedText: expect.stringContaining("Needle in semantic data"),
        },
      ],
      exhausted: true,
    });
  });

  it("matches query text literally without interpreting regular-expression metacharacters", async () => {
    const sessionHeader = header("session-literal");
    const query = createSessionQuery(pagedHistory([{
      header: sessionHeader,
      events: [metadataEvent(0, "a.*b literal")],
    }]));

    await expect(query.search({ text: "a.*b" })).resolves.toMatchObject({
      results: [{ sessionId: "session-literal", eventSeq: 0 }],
    });
    await expect(query.search({ text: "axxb" })).resolves.toMatchObject({
      results: [],
    });
  });

  it("reads one exact current-format event and returns null when it is absent", async () => {
    const sessionHeader = header("session-1");
    const expected = metadataEvent(1, "exact event");
    const query: SessionQueryCapability = createSessionQuery(
      pagedHistory([{
        header: sessionHeader,
        events: [metadataEvent(0, "first"), expected],
      }]),
    );

    await expect(query.readEvent(sessionHeader.id, SessionSeq(1))).resolves.toEqual(expected);
    await expect(query.readEvent(sessionHeader.id, SessionSeq(7))).resolves.toBeNull();
  });

  it("traces direct canonical source and derived event edges", async () => {
    const sessionHeader = header("session-1");
    const events = causalEvents();
    const query: SessionQueryCapability = createSessionQuery(
      pagedHistory([{ header: sessionHeader, events }]),
    );

    await expect(query.explainEvent(sessionHeader.id, SessionSeq(0))).resolves.toEqual({
      event: events[0],
      sources: [],
      derived: [SessionSeq(1)],
    });
    await expect(query.explainEvent(sessionHeader.id, SessionSeq(1))).resolves.toEqual({
      event: events[1],
      sources: [SessionSeq(0)],
      derived: [],
    });
    await expect(query.explainEvent(sessionHeader.id, SessionSeq(7))).resolves.toBeNull();
  });

  it("resumes semantic result pagination after its stable anchor", async () => {
    const sessions = [
      { header: header("session-1"), events: [metadataEvent(0, "needle one")] },
      { header: header("session-2"), events: [metadataEvent(0, "needle two")] },
    ];
    const query: SessionQueryCapability = createSessionQuery(pagedHistory(sessions));

    const first = await query.search({ text: "needle", limit: 1 });
    expect(first).toMatchObject({
      results: [{ stableId: "session-1:event:0" }],
      exhausted: false,
    });
    expect(first.cursor).toEqual(expect.any(String));

    sessions.unshift({
      header: header("session-new"),
      events: [metadataEvent(0, "needle created concurrently")],
    });
    await expect(query.search({ text: "needle", limit: 1, cursor: first.cursor })).resolves.toMatchObject({
      results: [{ stableId: "session-2:event:0" }],
      exhausted: true,
    });
  });

  it("filters canonical semantic records by folded surface classification", async () => {
    const sessionHeader = header("session-1");
    const query: SessionQueryCapability = createSessionQuery(
      pagedHistory([{ header: sessionHeader, events: compactedEvents() }]),
    );

    await expect(query.search({ text: "needle", surface: "current" })).resolves.toMatchObject({
      results: [{ stableId: "session-1:event:4" }],
    });
    await expect(query.search({ text: "needle", surface: "shadowed" })).resolves.toMatchObject({
      results: [{ stableId: "session-1:event:1" }],
    });
    await expect(query.search({ text: "needle", surface: "log-only" })).resolves.toMatchObject({
      results: [{ stableId: "session-1:event:3" }],
    });
  });

  it("applies workspace, rig, backend, and event-type filters to semantic records", async () => {
    const events = causalEvents();
    const query: SessionQueryCapability = createSessionQuery(
      pagedHistory([
        { header: header("wanted"), events },
        { header: header("wrong-backend", "coding-agent"), events },
        { header: header("wrong-rig", "chat", "rig-2"), events },
        { header: header("wrong-workspace", "chat", "rig-1", "workspace-2"), events },
      ]),
    );

    await expect(query.search({
      text: "derived",
      workspaceRootHash: "workspace-1",
      rigId: "rig-1",
      backend: "chat",
      eventTypes: ["user/message"],
      surface: "current",
    })).resolves.toMatchObject({
      results: [{ stableId: "wanted:event:1" }],
      exhausted: true,
    });
  });

  it("rejects an event-history page that does not advance", async () => {
    const sessionHeader = header("session-1");
    const repeated = metadataEvent(0, "repeated");
    const history = {
      async readWindow(_sessionId: unknown, request: SessionWindowRequest) {
        return {
          header: sessionHeader,
          events: [repeated],
          revision: SessionRevision(1),
          loadedRange: { start: 0, end: 0 },
          availability: { earlier: request.kind !== "head", later: request.kind === "head" },
          fidelity: sessionHeader.fidelity,
          repair: { state: "healthy" as const },
        };
      },
    } as unknown as SessionHistoryCapability;
    const query: SessionQueryCapability = createSessionQuery(history);

    await expect(query.explainEvent(sessionHeader.id, SessionSeq(0))).rejects.toMatchObject({
      code: "STALLED_HISTORY",
    });
  });

  it("rejects caller-selected result limits above the human query bound", async () => {
    const query = createSessionQuery(pagedHistory([]));

    await expect(query.search({ text: "needle", limit: 501 })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });
});

describe("SessionModelQueryCapability", () => {
  it("derives exact workspace authorization from the caller session and otherwise permits self only", async () => {
    const caller = header("caller");
    const sameWorkspace = header("same-workspace");
    const differentWorkspace = header("different-workspace", "chat", "rig-1", "workspace-2");
    const workspaceLessCaller = header("workspace-less", "chat", "rig-1", null);
    const history = pagedHistory([
      { header: caller, events: [metadataEvent(0, "needle caller")] },
      { header: sameWorkspace, events: [metadataEvent(0, "needle allowed")] },
      { header: differentWorkspace, events: [metadataEvent(0, "needle denied")] },
      { header: workspaceLessCaller, events: [metadataEvent(0, "needle self only")] },
    ]);
    const query: SessionModelQueryCapability = createModelSessionQuery(history);

    await expect(query.search({ callerSessionId: caller.id, text: "needle" })).resolves.toMatchObject({
      results: [
        { sessionId: caller.id },
        { sessionId: sameWorkspace.id },
      ],
    });
    await expect(query.readEvent({
      callerSessionId: caller.id,
      sessionId: differentWorkspace.id,
      seq: SessionSeq(0),
    })).resolves.toBeNull();
    await expect(query.readEvent({
      callerSessionId: caller.id,
      sessionId: SessionId("guessed-missing"),
      seq: SessionSeq(0),
    })).resolves.toBeNull();
    await expect(query.search({
      callerSessionId: workspaceLessCaller.id,
      text: "needle",
    })).resolves.toMatchObject({
      results: [{ sessionId: workspaceLessCaller.id }],
    });
  });

  it("redacts secrets, environment values, and local paths and blocks events without a current-format redactor", async () => {
    const caller = header("caller");
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
    const sensitive = metadataEvent(
      0,
      `API_KEY=${secret} at /Users/alice/private/project/.env`,
    );
    const unknownRequired = {
      type: "plugin/unknown-required",
      seq: SessionSeq(1),
      time: now + 1,
      data: { payload: secret },
    } as unknown as ParsedSessionEvent;
    const query = createModelSessionQuery(pagedHistory([{
      header: caller,
      events: [sensitive, unknownRequired],
    }]));

    const result = await query.readEvent({
      callerSessionId: caller.id,
      sessionId: caller.id,
      seq: SessionSeq(0),
    });
    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("/Users/alice");
    expect(result?.redaction.categories).toEqual(expect.arrayContaining(["environment", "path"]));
    await expect(query.readEvent({
      callerSessionId: caller.id,
      sessionId: caller.id,
      seq: SessionSeq(1),
    })).resolves.toBeNull();
  });

  it("applies fixed result and output budgets to redacted model search", async () => {
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
    const sessions = Array.from({ length: 20 }, (_, index) => ({
      header: header(`session-${index}-${"i".repeat(1_000)}`),
      events: [metadataEvent(
        0,
        `needle ${secret} /Users/alice/project/${index} ${"x".repeat(5_000)}`,
      )],
    }));
    const query = createModelSessionQuery(pagedHistory(sessions));

    const result = await query.search({
      callerSessionId: sessions[0]!.header.id,
      text: "needle",
    });

    expect(result.results).toHaveLength(8);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(12_000);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("/Users/alice");
    expect(result.redaction.categories).toEqual(expect.arrayContaining(["secret", "path", "output-budget"]));
    expect(result.truncated).toBe(true);
  });

  it("excludes the caller's currently executing step from model search", async () => {
    const caller = header("caller");
    const query = createModelSessionQuery(pagedHistory([{
      header: caller,
      events: currentExecutingStepEvents(),
    }]));

    const result = await query.search({ callerSessionId: caller.id, text: "needle" });

    expect(result.results.map((entry) => entry.eventSeq)).toEqual([SessionSeq(1)]);
    expect(JSON.stringify(result)).not.toContain("after invoking call");
    expect(JSON.stringify(result)).not.toContain("rawArguments");
  });

  it("cooperatively cancels a stalled model query", async () => {
    const caller = header("caller");
    const base = pagedHistory([{ header: caller, events: [metadataEvent(0, "needle")] }]);
    const history = {
      ...base,
      async list() {
        return await new Promise<never>(() => {});
      },
    } as SessionHistoryCapability;
    const query = createModelSessionQuery(history);
    const controller = new AbortController();

    const pending = query.search({
      callerSessionId: caller.id,
      text: "needle",
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("returns authorized bounded lineage and redacted causal explanations", async () => {
    const parent = header("parent");
    const child = parseSessionHeader({
      ...header("child"),
      parent: { sessionId: parent.id, boundarySeq: 0, seedLength: 1 },
      origin: "subagent",
    });
    const deniedChild = parseSessionHeader({
      ...header("denied-child", "chat", "rig-1", "workspace-2"),
      parent: { sessionId: parent.id, boundarySeq: 0, seedLength: 1 },
      origin: "subagent",
    });
    const events = causalEvents();
    const query = createModelSessionQuery(pagedHistory([
      { header: parent, events },
      { header: child, events: [metadataEvent(0, "child")] },
      { header: deniedChild, events: [metadataEvent(0, "denied")] },
    ]));

    await expect(query.traceSession({
      callerSessionId: parent.id,
      sessionId: parent.id,
    })).resolves.toMatchObject({
      sessionId: parent.id,
      childSessionIds: [child.id],
    });
    await expect(query.traceSession({
      callerSessionId: parent.id,
      sessionId: deniedChild.id,
    })).resolves.toBeNull();
    await expect(query.explainEvent({
      callerSessionId: parent.id,
      sessionId: parent.id,
      seq: SessionSeq(1),
    })).resolves.toMatchObject({
      event: { type: "user/message", seq: SessionSeq(1) },
      sources: [SessionSeq(0)],
      derived: [],
      redaction: expect.any(Object),
    });
  });
});
