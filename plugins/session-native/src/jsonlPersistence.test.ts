import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  SESSION_FORMAT_VERSION,
  RequestId,
  SessionId,
  SessionRevision,
  StepId,
  ToolCallId,
  TurnId,
  type AppendSessionEvent,
} from "@termco/session-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionHistory } from "./index";
import { JsonlSessionPersistence } from "./jsonlPersistence";

const roots: string[] = [];

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "termco-session-current-"));
  roots.push(path);
  return path;
}

function sessionHeader(id: string) {
  return {
    formatVersion: SESSION_FORMAT_VERSION,
    id: SessionId(id),
    createdAt: 100,
    authority: "v2" as const,
    backend: "chat",
    fidelity: "full" as const,
  };
}

function openRequestEvents(): readonly AppendSessionEvent[] {
  return [
    { type: "turn/start", time: 101, data: { turn: TurnId(1), cause: "user" } },
    { type: "step/start", time: 102, data: { turn: TurnId(1), step: StepId(1) } },
    {
      type: "request/header",
      time: 103,
      data: {
        turn: TurnId(1),
        step: StepId(1),
        requestId: RequestId("request-1"),
        reason: "initial",
        header: {
          selectedModelId: "model",
          providerRoute: "provider",
          providerModelId: "provider-model",
          systemPrompt: "system",
          messages: [],
          tools: [],
          activeTools: [],
          maxSteps: 8,
          approvalPolicy: {},
        },
      },
    },
  ];
}

function suspendedInteractiveEvents(): readonly AppendSessionEvent[] {
  return [
    ...openRequestEvents(),
    {
      type: "tool/call",
      time: 104,
      data: {
        turn: TurnId(1),
        step: StepId(1),
        requestId: RequestId("request-1"),
        callId: ToolCallId("call-1"),
        name: "ask_ui",
        rawArguments: "{}",
        parsedInput: {},
        contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
        concurrency: "exclusive",
      },
    },
    {
      type: "assistant/message",
      time: 105,
      data: {
        turn: TurnId(1),
        step: StepId(1),
        requestId: RequestId("request-1"),
        message: {
          id: "assistant-1",
          role: "assistant",
          parts: [{
            type: "tool-ask_ui",
            toolCallId: "call-1",
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
      time: 106,
      data: {
        turn: TurnId(1),
        step: StepId(1),
        reason: "human-input",
        callIds: [ToolCallId("call-1")],
        approvalIds: [],
      },
    },
  ];
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("current-format JSONL session persistence", () => {
  it("keeps repeated small appends incremental after one validated load", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({ header: sessionHeader("incremental-a"), durability: "written" });
    const parse = vi.spyOn(JSON, "parse");

    try {
      for (let index = 0; index < 40; index += 1) {
        await history.append(SessionId("incremental-a"), [{
          type: "session/title",
          time: 200 + index,
          data: { title: `Title ${index}`, source: "user" },
        }], { durability: "written" });
      }

      expect(parse).toHaveBeenCalledTimes(0);
      parse.mockClear();
      await expect(history.inspect(SessionId("incremental-a"))).resolves.toMatchObject({
        revision: 40,
        tailSeq: 39,
      });
      expect(parse).toHaveBeenCalled();
      parse.mockClear();
      await expect(history.readWindow(SessionId("incremental-a"), { kind: "tail", limit: 2 }))
        .resolves.toMatchObject({
          revision: 40,
          events: [
            { seq: 38, data: { title: "Title 38" } },
            { seq: 39, data: { title: "Title 39" } },
          ],
        });
      expect(parse).toHaveBeenCalledTimes(0);
    } finally {
      parse.mockRestore();
    }
  });

  it("reopens exact owner-assigned events and revisions after disposal", async () => {
    const path = await root();
    const first = createSessionHistory(new JsonlSessionPersistence(path));
    await first.create({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("durable-a"),
        createdAt: 100,
        authority: "v2",
        backend: "chat",
        fidelity: "full",
      },
      durability: "flushed",
    });
    const title: AppendSessionEvent<"session/title"> = {
      type: "session/title",
      time: 200,
      data: { title: "Durable", source: "user" },
    };
    await first.append(SessionId("durable-a"), [title], { durability: "flushed" });
    await first.dispose();

    const reopened = createSessionHistory(new JsonlSessionPersistence(path));
    const window = await reopened.readWindow(SessionId("durable-a"), { kind: "head", limit: 10 });
    expect(window).toMatchObject({ revision: 1, availability: { earlier: false, later: false } });
    expect(window.events).toEqual([{ ...title, seq: 0 }]);
    await expect(reopened.list()).resolves.toMatchObject({
      sessions: [{ sessionId: "durable-a", title: "Durable", revision: 1 }],
    });
  });

  it("reopens a suspended human-input turn without repairing or closing it", async () => {
    const path = await root();
    const first = createSessionHistory(new JsonlSessionPersistence(path));
    await first.create({ header: sessionHeader("waiting-a") });
    await first.append(SessionId("waiting-a"), suspendedInteractiveEvents(), {
      durability: "flushed",
    });
    await first.dispose();

    const reopened = createSessionHistory(new JsonlSessionPersistence(path));
    const before = await readFile(join(path, "waiting-a", "events.jsonl"), "utf8");
    const inspection = await reopened.inspect(SessionId("waiting-a"));
    expect(inspection.state).toBe("waiting-input");
    expect(inspection).not.toHaveProperty("proposedRepair");

    const continued = await reopened.loadForContinuation(SessionId("waiting-a"));
    expect(continued.repair).toEqual({ state: "waiting-input" });
    expect(continued.events.at(-1)).toMatchObject({ type: "turn/suspend", seq: 5 });
    expect(await readFile(join(path, "waiting-a", "events.jsonl"), "utf8")).toBe(before);
  });

  it("classifies and safely discards only an unterminated physical tail", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({
      header: sessionHeader("torn-a"),
    });
    await history.append(SessionId("torn-a"), [{
      type: "session/title",
      time: 110,
      data: { title: "Committed", source: "user" },
    }], { durability: "written" });
    const eventsPath = join(path, "torn-a", "events.jsonl");
    await appendFile(eventsPath, '{"formatVersion":2,"kind":"commit"', "utf8");
    const before = await readFile(eventsPath, "utf8");

    await expect(history.inspect(SessionId("torn-a"))).resolves.toEqual({
      sessionId: "torn-a",
      state: "repairable-tail",
      revision: SessionRevision(1),
      tailSeq: 0,
      safeThroughSeq: 0,
      proposedRepair: [],
      message: "unterminated final commit bytes can be discarded",
    });
    expect(await readFile(eventsPath, "utf8")).toBe(before);

    const observed: unknown[] = [];
    history.subscribe(SessionId("torn-a"), (commit) => observed.push(commit));
    const continued = await history.loadForContinuation(SessionId("torn-a"));

    expect(continued).toMatchObject({
      revision: 1,
      repair: { state: "repaired", repairedThroughSeq: 0 },
    });
    expect(observed).toEqual([]);
    expect(await readFile(eventsPath, "utf8")).not.toContain('"kind":"commit"{"formatVersion"');
    await expect(history.append(SessionId("torn-a"), [{
      type: "session/title",
      time: 120,
      data: { title: "After repair", source: "user" },
    }], { expectedRevision: SessionRevision(1), durability: "written" })).resolves.toMatchObject({
      revision: 2,
      firstSeq: 1,
    });
  });

  it("surfaces newline-terminated committed-prefix corruption and never repairs it", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({ header: sessionHeader("corrupt-a") });
    const eventsPath = join(path, "corrupt-a", "events.jsonl");
    await appendFile(eventsPath, `{not-json}\n${JSON.stringify({
      formatVersion: SESSION_FORMAT_VERSION,
      kind: "commit",
      revision: 2,
      events: [],
    })}\n`, "utf8");
    const before = await readFile(eventsPath, "utf8");

    await expect(history.inspect(SessionId("corrupt-a"))).resolves.toMatchObject({
      sessionId: "corrupt-a",
      state: "corrupt-prefix",
      revision: 0,
      message: expect.stringContaining("commit 1"),
    });
    await expect(history.loadForContinuation(SessionId("corrupt-a")))
      .rejects.toMatchObject({ code: "CORRUPT_SESSION" });
    await expect(history.readWindow(SessionId("corrupt-a"), { kind: "head", limit: 10 }))
      .rejects.toMatchObject({ code: "CORRUPT_SESSION" });
    expect(await readFile(eventsPath, "utf8")).toBe(before);
  });

  it("classifies a committed sequence gap as corruption without truncating the prefix", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({ header: sessionHeader("gap-a") });
    const eventsPath = join(path, "gap-a", "events.jsonl");
    await appendFile(eventsPath, `${JSON.stringify({
      formatVersion: SESSION_FORMAT_VERSION,
      kind: "commit",
      revision: 1,
      events: [{
        type: "session/title",
        seq: 7,
        time: 101,
        data: { title: "Gap", source: "user" },
      }],
    })}\n`, "utf8");
    const before = await readFile(eventsPath, "utf8");

    await expect(history.inspect(SessionId("gap-a"))).resolves.toMatchObject({
      state: "corrupt-prefix",
      revision: 0,
      message: expect.stringContaining("expected sequence 0"),
    });
    await expect(history.loadForContinuation(SessionId("gap-a")))
      .rejects.toMatchObject({ code: "CORRUPT_SESSION" });
    expect(await readFile(eventsPath, "utf8")).toBe(before);
  });

  it("rejects an unsupported format before inspecting its event body", async () => {
    const path = await root();
    const dir = join(path, "future-a");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(dir, { recursive: true }));
    await writeFile(join(dir, "header.json"), `${JSON.stringify({
      ...sessionHeader("future-a"),
      formatVersion: 999,
    })}\n`, "utf8");
    await writeFile(join(dir, "events.jsonl"), "this event body must not be parsed\n", "utf8");
    const history = createSessionHistory(new JsonlSessionPersistence(path));

    await expect(history.inspect(SessionId("future-a"))).resolves.toEqual({
      sessionId: "future-a",
      state: "unsupported-format",
      message: "session future-a format 999 is unsupported",
    });
    await expect(history.loadForContinuation(SessionId("future-a")))
      .rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });

  it("classifies a current-format header bound to the wrong session id as corruption", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({ header: sessionHeader("wrong-id") });
    await writeFile(
      join(path, "wrong-id", "header.json"),
      `${JSON.stringify(sessionHeader("different-id"))}\n`,
      "utf8",
    );

    await expect(history.inspect(SessionId("wrong-id"))).resolves.toMatchObject({
      sessionId: "wrong-id",
      state: "corrupt-prefix",
      message: "session directory wrong-id contains header for different-id",
    });
    await expect(history.loadForContinuation(SessionId("wrong-id")))
      .rejects.toMatchObject({ code: "CORRUPT_SESSION" });
  });

  it("repairs a durable tool call with outcome-unknown and publishes one flushed revision", async () => {
    const path = await root();
    const first = createSessionHistory(new JsonlSessionPersistence(path));
    await first.create({ header: sessionHeader("unknown-tool") });
    await first.append(SessionId("unknown-tool"), [
      ...openRequestEvents(),
      {
        type: "assistant/chunk",
        time: 104,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-1"),
          chunk: { kind: "text-delta", delta: "Visible prefix" },
        },
      },
      {
        type: "tool/call",
        time: 105,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-1"),
          callId: ToolCallId("call-1"),
          name: "write_file",
          rawArguments: "{}",
          contributor: { pluginId: "ai-tools-files-native" },
          concurrency: "exclusive",
        },
      },
    ], { durability: "written" });
    await first.dispose();

    const history = createSessionHistory(new JsonlSessionPersistence(path));
    const eventsPath = join(path, "unknown-tool", "events.jsonl");
    const beforeInspection = await readFile(eventsPath, "utf8");
    const proposed = await history.inspect(SessionId("unknown-tool"));
    expect(proposed).toMatchObject({
      state: "repairable-tail",
      revision: 1,
      tailSeq: 4,
      proposedRepair: [
        { type: "assistant/message", data: { interrupted: true } },
        { type: "tool/result", data: { callId: "call-1", recovered: "outcome-unknown" } },
        { type: "step/end", data: { reason: "interrupted" } },
        { type: "turn/end", data: { reason: { kind: "interrupted", repair: true } } },
      ],
    });
    await expect(history.inspect(SessionId("unknown-tool"))).resolves.toEqual(proposed);
    expect(await readFile(eventsPath, "utf8")).toBe(beforeInspection);

    const commits: unknown[] = [];
    history.subscribe(SessionId("unknown-tool"), (commit) => commits.push(commit));
    const continued = await history.loadForContinuation(SessionId("unknown-tool"));

    expect(continued.revision).toBe(2);
    expect(continued.repair).toEqual({ state: "repaired", repairedThroughSeq: 8 });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ revision: 2, durability: "flushed", tailSeq: 8 });
    await expect(history.loadForContinuation(SessionId("unknown-tool"))).resolves.toMatchObject({
      revision: 2,
      repair: { state: "repaired", repairedThroughSeq: 8 },
    });
    expect(commits).toHaveLength(1);
  });

  it("repairs an assistant-requested call that was never durably started as not-started", async () => {
    const path = await root();
    const first = createSessionHistory(new JsonlSessionPersistence(path));
    await first.create({ header: sessionHeader("not-started") });
    await first.append(SessionId("not-started"), [
      ...openRequestEvents(),
      {
        type: "assistant/message",
        time: 104,
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-1"),
          message: {
            id: "assistant-1",
            role: "assistant",
            parts: [{
              type: "tool-write_file",
              toolCallId: "call-unstarted",
              state: "input-available",
              input: { path: "a.txt" },
            }],
          },
          finishReason: "tool-calls",
        },
        surfaceOp: { op: "append" },
      },
    ], { durability: "written" });
    await first.dispose();

    const history = createSessionHistory(new JsonlSessionPersistence(path));
    const inspection = await history.inspect(SessionId("not-started"));
    expect(inspection.proposedRepair).toMatchObject([
      { type: "tool/call", data: { callId: "call-unstarted", name: "write_file" } },
      { type: "tool/result", data: { callId: "call-unstarted", recovered: "not-started" } },
      { type: "step/end", data: { reason: "interrupted" } },
      { type: "turn/end", data: { reason: { kind: "interrupted", repair: true } } },
    ]);

    const continued = await history.loadForContinuation(SessionId("not-started"));
    expect(continued.events.slice(-4)).toMatchObject([
      { type: "tool/call", data: { callId: "call-unstarted" } },
      { type: "tool/result", data: { recovered: "not-started" } },
      { type: "step/end" },
      { type: "turn/end" },
    ]);
  });

  it("keeps memory acknowledgements process-local until flush and persists written acknowledgements", async () => {
    const path = await root();
    const first = createSessionHistory(new JsonlSessionPersistence(path));
    await first.create({ header: sessionHeader("durability-a") });
    await first.append(SessionId("durability-a"), [{
      type: "session/title",
      time: 101,
      data: { title: "Memory", source: "user" },
    }], { durability: "memory" });

    const beforeFlush = createSessionHistory(new JsonlSessionPersistence(path));
    await expect(beforeFlush.readWindow(SessionId("durability-a"), { kind: "head", limit: 10 }))
      .resolves.toMatchObject({ revision: 0, events: [] });

    await expect(first.flush(SessionId("durability-a"))).resolves.toBe(1);
    const afterFlush = createSessionHistory(new JsonlSessionPersistence(path));
    await expect(afterFlush.readWindow(SessionId("durability-a"), { kind: "head", limit: 10 }))
      .resolves.toMatchObject({ revision: 1, events: [{ data: { title: "Memory" } }] });

    await first.append(SessionId("durability-a"), [{
      type: "session/title",
      time: 102,
      data: { title: "Written", source: "user" },
    }], { durability: "written" });
    const afterWritten = createSessionHistory(new JsonlSessionPersistence(path));
    await expect(afterWritten.readWindow(SessionId("durability-a"), { kind: "head", limit: 10 }))
      .resolves.toMatchObject({ revision: 2, events: [{}, { data: { title: "Written" } }] });
  });

  it("orders flush after accepted appends and disposal drains memory acknowledgements", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({ header: sessionHeader("drain-a") });
    const commits: number[] = [];
    history.subscribe(SessionId("drain-a"), (commit) => commits.push(commit.revision as number));

    const append = history.append(SessionId("drain-a"), [{
      type: "session/title",
      time: 101,
      data: { title: "Accepted", source: "user" },
    }], { durability: "memory" });
    const flush = history.flush(SessionId("drain-a"));

    await expect(append).resolves.toMatchObject({ revision: 1, durability: "memory" });
    await expect(flush).resolves.toBe(1);
    expect(commits).toEqual([1]);
    await history.append(SessionId("drain-a"), [{
      type: "session/title",
      time: 102,
      data: { title: "Dispose drain", source: "user" },
    }], { durability: "memory" });
    await history.dispose();

    const reopened = createSessionHistory(new JsonlSessionPersistence(path));
    await expect(reopened.readWindow(SessionId("drain-a"), { kind: "head", limit: 10 }))
      .resolves.toMatchObject({
        revision: 2,
        events: [
          { data: { title: "Accepted" } },
          { data: { title: "Dispose drain" } },
        ],
      });
  });

  it("keeps a current-format session visible when its event tail is repairable", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("corrupt-visible"),
        createdAt: 100,
        authority: "v2",
        backend: "chat",
        fidelity: "full",
      },
    });
    await import("node:fs/promises").then(({ appendFile }) =>
      appendFile(join(path, "corrupt-visible", "events.jsonl"), "{partial", "utf8"),
    );

    await expect(history.list()).resolves.toMatchObject({
      sessions: [{
        sessionId: "corrupt-visible",
        health: "repairable-tail",
      }],
    });
  });

  it("rejects a list cursor that does not identify a current session", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));

    await expect(history.list({ cursor: "missing-session" })).rejects.toMatchObject({
      code: "INVALID_LIST_REQUEST",
    });
  });

  it("filters durable listings by the latest canonical rig assignment", async () => {
    const path = await root();
    const history = createSessionHistory(new JsonlSessionPersistence(path));
    await history.create({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("moved-rig"),
        createdAt: 100,
        authority: "v2",
        backend: "chat",
        fidelity: "full",
        rigId: "rig-a",
      },
    });
    await history.append(SessionId("moved-rig"), [{
      type: "session/rig",
      time: 200,
      data: { rigId: "rig-b", source: "user" },
    }]);

    await expect(history.list({ rigId: "rig-a" })).resolves.toMatchObject({ sessions: [] });
    await expect(history.list({ rigId: "rig-b" })).resolves.toMatchObject({
      sessions: [{ sessionId: "moved-rig", rigId: "rig-b" }],
    });
  });
});
