// @vitest-environment jsdom
// Source-owned by the coding-agent-native plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentEvent,
  AgentRunSummary,
  AgentSessionSummary,
} from "../lib/protocol";

const client = vi.hoisted(() => ({
  startRun: vi.fn((_params: unknown, _onEvent: (e: AgentEvent) => void) =>
    Promise.resolve(),
  ),
  sendAgentInput: vi.fn(() => Promise.resolve({ ok: true })),
  abortAgentRun: vi.fn(() => Promise.resolve({ ok: true })),
  endAgentRun: vi.fn(() => Promise.resolve({ ok: true })),
  forgetAgentRun: vi.fn(() => Promise.resolve({ ok: true })),
  listBackends: vi.fn(() => Promise.resolve([])),
  listRuns: vi.fn((): Promise<AgentRunSummary[]> => Promise.resolve([])),
  resubscribeRun: vi.fn(
    (
      _runId: string,
      _onEvent: (e: AgentEvent) => void,
    ): Promise<{ ok: boolean }> => Promise.resolve({ ok: true }),
  ),
  approveAgentTool: vi.fn(() => Promise.resolve({ ok: true })),
  listSessions: vi.fn(
    (): Promise<AgentSessionSummary[]> => Promise.resolve([]),
  ),
  listAllSessions: vi.fn(
    (): Promise<AgentSessionSummary[]> => Promise.resolve([]),
  ),
  loadSessionEvents: vi.fn((): Promise<AgentEvent[]> => Promise.resolve([])),
}));

vi.mock("../lib/client", () => client);

import {
  countUnseen,
  isRunBusy,
  useCodingAgentsStore,
} from "./codingAgentsStore";

function reset() {
  useCodingAgentsStore.setState({ runs: {}, activeRunId: null, sessions: [] });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe("codingAgentsStore", () => {
  it("startRun registers a run, makes it active, and calls the driver", async () => {
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "Refactor the auth module\nand add tests",
      cwd: "/repo",
      now: 1000,
    });
    const st = useCodingAgentsStore.getState();
    expect(st.activeRunId).toBe(runId);
    const run = st.runs[runId];
    expect(run.backend).toBe("claude");
    expect(run.title).toBe("Refactor the auth module"); // first line only
    expect(run.status).toBe("starting");
    expect(client.startRun).toHaveBeenCalledOnce();
  });

  it("streamed events fold into the run's transcript", async () => {
    let sink: (e: AgentEvent) => void = () => {};
    client.startRun.mockImplementationOnce(
      (_p: unknown, onEvent: (e: AgentEvent) => void) => {
        sink = onEvent;
        return Promise.resolve();
      },
    );
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "hi",
      cwd: "/repo",
    });
    sink({ type: "session", sessionId: "s1", model: "opus" });
    sink({ type: "text", text: "Working on it." });
    sink({ type: "turn-end" });

    const run = useCodingAgentsStore.getState().runs[runId];
    expect(run.sessionId).toBe("s1");
    expect(run.status).toBe("idle");
    expect(run.messages).toHaveLength(1);
    expect((run.messages[0].parts[0] as { text: string }).text).toBe(
      "Working on it.",
    );
  });

  it("sendInput (when idle) appends the follow-up and calls the driver", async () => {
    const store = useCodingAgentsStore.getState();
    const runId = await store.startRun({
      backend: "claude",
      prompt: "start",
      cwd: "/repo",
    });
    // A follow-up is only accepted once the run is idle (not while busy).
    store.ingest(runId, { type: "turn-end" });
    await useCodingAgentsStore.getState().sendInput(runId, "  now do X  ");
    const run = useCodingAgentsStore.getState().runs[runId];
    const user = run.messages.find((m) => m.role === "user");
    expect((user?.parts[0] as { text: string }).text).toBe("now do X");
    expect(run.status).toBe("running");
    expect(client.sendAgentInput).toHaveBeenCalledWith(runId, "now do X", {
      model: undefined,
      permissionMode: "default",
      effort: undefined,
    });
  });

  it("sendInput is dropped while the run is still busy", async () => {
    const store = useCodingAgentsStore.getState();
    const runId = await store.startRun({
      backend: "claude",
      prompt: "start",
      cwd: "/repo",
    });
    // status is "starting" (busy) — no ghost user message, no driver call.
    await useCodingAgentsStore.getState().sendInput(runId, "too soon");
    expect(client.sendAgentInput).not.toHaveBeenCalled();
    expect(useCodingAgentsStore.getState().runs[runId].messages).toHaveLength(
      0,
    );
  });

  it("ignores an empty follow-up", async () => {
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "start",
      cwd: "/repo",
    });
    await useCodingAgentsStore.getState().sendInput(runId, "   ");
    expect(client.sendAgentInput).not.toHaveBeenCalled();
  });

  it("abort and end call the driver", async () => {
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "codex",
      prompt: "x",
      cwd: "/repo",
    });
    await useCodingAgentsStore.getState().abort(runId);
    await useCodingAgentsStore.getState().end(runId);
    expect(client.abortAgentRun).toHaveBeenCalledWith(runId);
    expect(client.endAgentRun).toHaveBeenCalledWith(runId);
  });

  it("rehydrate rebuilds driver-held runs and replays their events", async () => {
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "x",
        backend: "claude",
        prompt: "the task",
        cwd: "/r",
        sessionId: "s1",
        running: true,
        permissionMode: "bypass",
      },
    ]);
    let sink: (e: AgentEvent) => void = () => {};
    client.resubscribeRun.mockImplementationOnce(
      (_runId: string, onEvent: (e: AgentEvent) => void) => {
        sink = onEvent;
        return Promise.resolve({ ok: true });
      },
    );

    await useCodingAgentsStore.getState().rehydrate();
    const run = useCodingAgentsStore.getState().runs.x;
    expect(run).toBeDefined();
    expect(run.title).toBe("the task");
    expect(run.sessionId).toBe("s1");
    // Permission mode is carried on the summary, not reset to default.
    expect(run.permissionMode).toBe("bypass");

    // Replayed events fold back into the transcript.
    sink({ type: "text", text: "resumed output" });
    sink({ type: "turn-end" });
    const after = useCodingAgentsStore.getState().runs.x;
    expect((after.messages[0].parts[0] as { text: string }).text).toBe(
      "resumed output",
    );
    expect(after.status).toBe("idle");
  });

  it("rehydrate reopens a persisted (dead) run from its session history", async () => {
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "old",
        backend: "claude",
        prompt: "past task",
        cwd: "/r",
        sessionId: "sess-old",
        running: false,
        live: false,
        title: "past task",
        projectSlug: "-r",
        createdAt: 100,
        status: "done",
        permissionMode: "acceptEdits",
      },
    ]);
    client.loadSessionEvents.mockResolvedValueOnce([
      { type: "user-message", text: "past task" },
      { type: "message-start" },
      { type: "text", text: "did it" },
      { type: "turn-end" },
    ]);

    await useCodingAgentsStore.getState().rehydrate();
    const run = useCodingAgentsStore.getState().runs.old;
    expect(run).toBeDefined();
    // Loaded from the session file, not resubscribed.
    expect(client.resubscribeRun).not.toHaveBeenCalledWith(
      "old",
      expect.anything(),
    );
    expect(client.loadSessionEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: "claude",
        projectSlug: "-r",
        sessionId: "sess-old",
      }),
    );
    expect(run.permissionMode).toBe("acceptEdits");
    expect(run.status).toBe("done");
    expect(run.messages.length).toBeGreaterThan(0);
  });

  it("rehydrate clears a stale busy status when the driver no longer owns the run", async () => {
    await useCodingAgentsStore.getState().startRun({
      runId: "stale",
      backend: "claude",
      prompt: "interrupted task",
      cwd: "/r",
    });
    useCodingAgentsStore.setState((state) => ({
      runs: {
        ...state.runs,
        stale: {
          ...state.runs.stale,
          sessionId: "sess-stale",
          status: "running",
        },
      },
    }));
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "stale",
        backend: "claude",
        prompt: "interrupted task",
        cwd: "/r",
        sessionId: "sess-stale",
        running: false,
        live: false,
        title: "interrupted task",
        createdAt: 100,
        status: "running",
      },
    ]);

    await useCodingAgentsStore.getState().rehydrate();

    expect(useCodingAgentsStore.getState().runs.stale.status).toBe("idle");
    expect(client.resubscribeRun).not.toHaveBeenCalledWith(
      "stale",
      expect.anything(),
    );
  });

  it("rehydrate carries the run's workspace onto the view", async () => {
    const ssh = {
      kind: "ssh" as const,
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    };
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "old",
        backend: "claude",
        prompt: "remote task",
        cwd: "/srv/app",
        sessionId: "sess-old",
        running: false,
        live: false,
        title: "remote task",
        createdAt: 100,
        status: "done",
        workspace: ssh,
      },
    ]);
    await useCodingAgentsStore.getState().rehydrate();
    expect(useCodingAgentsStore.getState().runs.old.workspace).toEqual(ssh);
  });

  it("sendInput revives a dead run via its PERSISTED workspace (never the active rig)", async () => {
    const ssh = {
      kind: "ssh" as const,
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    };
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "old",
        backend: "claude",
        prompt: "remote task",
        cwd: "/srv/app",
        sessionId: "sess-old",
        running: false,
        live: false,
        title: "remote task",
        createdAt: 100,
        status: "done",
        workspace: ssh,
      },
    ]);
    await useCodingAgentsStore.getState().rehydrate();
    // The driver no longer holds the run after an app restart.
    client.sendAgentInput.mockResolvedValueOnce({ ok: false });

    await useCodingAgentsStore.getState().sendInput("old", "continue please");

    // Revived under the SAME runId, resuming the session on the SAME host.
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "old",
        backend: "claude",
        prompt: "continue please",
        cwd: "/srv/app",
        resumeSessionId: "sess-old",
        workspace: ssh,
      }),
      expect.any(Function),
    );
    // The follow-up shows in the transcript.
    const run = useCodingAgentsStore.getState().runs.old;
    const user = run.messages.filter((m) => m.role === "user").at(-1);
    expect((user?.parts[0] as { text: string }).text).toBe("continue please");
  });

  it("sendInput does NOT revive a dead run without a session id", async () => {
    client.listRuns.mockResolvedValueOnce([
      {
        runId: "old",
        backend: "claude",
        prompt: "t",
        cwd: "/r",
        sessionId: null,
        running: false,
        live: false,
        title: "t",
        createdAt: 1,
        status: "error",
      },
    ]);
    await useCodingAgentsStore.getState().rehydrate();
    client.sendAgentInput.mockResolvedValueOnce({ ok: false });
    await useCodingAgentsStore.getState().sendInput("old", "hello?");
    expect(client.startRun).not.toHaveBeenCalled();
  });

  it("resumeSession prefers the history run's own workspace over the active rig", async () => {
    const ssh = {
      kind: "ssh" as const,
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    };
    // Seed a history run that knows where its session lives (remote listing).
    useCodingAgentsStore.setState((s) => ({
      runs: {
        ...s.runs,
        "hist:claude:s9": {
          ...s.runs["hist:claude:s9"],
          runId: "hist:claude:s9",
          messages: [],
          status: "done" as const,
          pendingApprovalId: null,
          sessionId: "s9",
          cwd: "/srv/app",
          backend: "claude" as const,
          title: "old session",
          permissionMode: "default" as const,
          createdAt: 5,
          workspace: ssh,
        },
      },
    }));
    await useCodingAgentsStore
      .getState()
      .resumeSession("hist:claude:s9", "weiter", { kind: "local" });
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: "s9", workspace: ssh }),
      expect.any(Function),
    );
  });

  it("loadSessions surfaces an unreachable-host error instead of an empty list", async () => {
    client.listAllSessions.mockRejectedValueOnce(
      new Error(
        "Host root@opendoc-v2 is unreachable — its sessions live there.",
      ),
    );
    await useCodingAgentsStore.getState().loadSessions({
      kind: "ssh",
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    });
    const st = useCodingAgentsStore.getState();
    expect(st.sessions).toEqual([]);
    expect(st.sessionsError).toContain("unreachable");
    // A later successful load clears the error.
    client.listAllSessions.mockResolvedValueOnce([]);
    await useCodingAgentsStore.getState().loadSessions();
    expect(useCodingAgentsStore.getState().sessionsError).toBeNull();
  });

  it("sets sessionsLoading during the fetch (localized spinner) and clears it after", async () => {
    let resolve!: (v: unknown[]) => void;
    client.listAllSessions.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r as (v: unknown[]) => void;
      }),
    );
    const p = useCodingAgentsStore.getState().loadSessions();
    expect(useCodingAgentsStore.getState().sessionsLoading).toBe(true);
    resolve([]);
    await p;
    expect(useCodingAgentsStore.getState().sessionsLoading).toBe(false);
  });

  it("clears the previous rig's history IMMEDIATELY on a rig switch (never shows the wrong rig)", async () => {
    // Rig A loaded.
    client.listAllSessions.mockResolvedValueOnce([
      {
        sessionId: "a",
        backend: "claude",
        projectSlug: "",
        name: "A",
        cwd: "/a",
        updatedAt: 1,
        messageCount: 1,
      },
    ]);
    await useCodingAgentsStore.getState().loadSessions({ kind: "local" });
    expect(
      useCodingAgentsStore.getState().sessions.map((s) => s.sessionId),
    ).toEqual(["a"]);

    // Switch to a DIFFERENT (ssh) rig with a slow load: the old rig's sessions
    // must be dropped at once (localized spinner), NOT left on screen.
    let resolveB!: (v: unknown[]) => void;
    client.listAllSessions.mockReturnValueOnce(
      new Promise((r) => {
        resolveB = r as (v: unknown[]) => void;
      }),
    );
    const p = useCodingAgentsStore
      .getState()
      .loadSessions({ kind: "ssh", connectionId: "h", host: "h" });
    expect(useCodingAgentsStore.getState().sessions).toEqual([]);
    expect(useCodingAgentsStore.getState().sessionsLoading).toBe(true);
    resolveB([
      {
        sessionId: "b",
        backend: "claude",
        projectSlug: "",
        name: "B",
        cwd: "/b",
        updatedAt: 2,
        messageCount: 1,
      },
    ]);
    await p;
    expect(
      useCodingAgentsStore.getState().sessions.map((s) => s.sessionId),
    ).toEqual(["b"]);
  });

  it("a SAME-rig refresh keeps the current list while loading (no flash)", async () => {
    client.listAllSessions.mockResolvedValueOnce([
      {
        sessionId: "a",
        backend: "claude",
        projectSlug: "",
        name: "A",
        cwd: "/a",
        updatedAt: 1,
        messageCount: 1,
      },
    ]);
    await useCodingAgentsStore.getState().loadSessions({ kind: "local" });
    // Refresh the SAME rig (slow): the list stays visible, no clear-to-empty.
    let resolve!: (v: unknown[]) => void;
    client.listAllSessions.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r as (v: unknown[]) => void;
      }),
    );
    const p = useCodingAgentsStore.getState().loadSessions({ kind: "local" });
    expect(
      useCodingAgentsStore.getState().sessions.map((s) => s.sessionId),
    ).toEqual(["a"]);
    expect(useCodingAgentsStore.getState().sessionsLoading).toBe(true);
    resolve([]);
    await p;
  });

  it("ignores a stale (superseded) load — a slow ssh reply can't clobber the current rig", async () => {
    // Load A is slow; load B (newer switch) resolves first with the real data.
    let resolveA!: (v: unknown[]) => void;
    client.listAllSessions.mockReturnValueOnce(
      new Promise((r) => {
        resolveA = r as (v: unknown[]) => void;
      }),
    );
    const a = useCodingAgentsStore.getState().loadSessions({
      kind: "ssh",
      connectionId: "old",
      host: "old",
    });
    client.listAllSessions.mockResolvedValueOnce([
      {
        sessionId: "s-new",
        backend: "claude",
        projectSlug: "",
        name: "new rig session",
        cwd: "/new",
        updatedAt: 2,
        messageCount: 1,
      },
    ]);
    await useCodingAgentsStore.getState().loadSessions({ kind: "local" });
    expect(
      useCodingAgentsStore.getState().sessions.map((s) => s.sessionId),
    ).toEqual(["s-new"]);
    // Now the OLD, superseded load resolves — it must NOT overwrite the new rig.
    resolveA([
      {
        sessionId: "s-old",
        backend: "claude",
        projectSlug: "",
        name: "old rig session",
        cwd: "/old",
        updatedAt: 1,
        messageCount: 1,
      },
    ]);
    await a;
    expect(
      useCodingAgentsStore.getState().sessions.map((s) => s.sessionId),
    ).toEqual(["s-new"]);
  });

  it("openSession carries the summary's workspace onto the history view", async () => {
    const ssh = {
      kind: "ssh" as const,
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    };
    client.loadSessionEvents.mockResolvedValueOnce([]);
    const runId = await useCodingAgentsStore.getState().openSession({
      backend: "claude",
      sessionId: "s7",
      projectSlug: "-srv-app",
      name: "remote session",
      cwd: "/srv/app",
      updatedAt: 9,
      messageCount: 1,
      workspace: ssh,
    });
    expect(useCodingAgentsStore.getState().runs[runId].workspace).toEqual(ssh);
    // And the client got the workspace-bearing summary (remote read routing).
    expect(client.loadSessionEvents).toHaveBeenCalledWith(
      expect.objectContaining({ workspace: ssh }),
    );
  });

  it("remove forgets the persisted record", async () => {
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "go",
      cwd: "/r",
    });
    useCodingAgentsStore.getState().remove(runId);
    expect(client.forgetAgentRun).toHaveBeenCalledWith(runId);
  });

  it("rehydrate skips runs already present (idempotent)", async () => {
    client.listRuns.mockResolvedValue([
      {
        runId: "x",
        backend: "claude",
        prompt: "t",
        cwd: "/r",
        sessionId: null,
        running: true,
      },
    ]);
    await useCodingAgentsStore.getState().rehydrate();
    await useCodingAgentsStore.getState().rehydrate();
    expect(client.resubscribeRun).toHaveBeenCalledTimes(1);
  });

  it("respondApproval clears the block and answers the driver", async () => {
    let sink: (e: AgentEvent) => void = () => {};
    client.startRun.mockImplementationOnce(
      (_p: unknown, onEvent: (e: AgentEvent) => void) => {
        sink = onEvent;
        return Promise.resolve();
      },
    );
    const runId = await useCodingAgentsStore
      .getState()
      .startRun({ backend: "claude", prompt: "p", cwd: "/r" });
    // The backend asks to run a tool → the run blocks awaiting approval.
    sink({ type: "message-start" });
    sink({
      type: "approval-request",
      approvalId: "ap1",
      toolCallId: "t1",
      name: "bash",
      input: {},
    });
    expect(useCodingAgentsStore.getState().runs[runId].status).toBe(
      "awaiting-approval",
    );

    await useCodingAgentsStore.getState().respondApproval(runId, "ap1", true);
    const run = useCodingAgentsStore.getState().runs[runId];
    expect(run.pendingApprovalId).toBeNull();
    expect(run.status).toBe("running");
    expect(client.approveAgentTool).toHaveBeenCalledWith(runId, "ap1", true, {
      always: undefined,
    });
  });

  it("flags unseen background activity and clears it on open", async () => {
    const store = useCodingAgentsStore.getState();
    const bg = await store.startRun({
      backend: "claude",
      prompt: "bg",
      cwd: "/r",
    });
    const other = await store.startRun({
      backend: "codex",
      prompt: "other",
      cwd: "/r",
    });
    // `other` is the active run (startRun sets it). A turn-end on the background
    // run should flag it unseen.
    useCodingAgentsStore.getState().setActive(other);
    useCodingAgentsStore.getState().ingest(bg, { type: "turn-end" });
    expect(useCodingAgentsStore.getState().runs[bg].unseen).toBe(true);
    expect(countUnseen(useCodingAgentsStore.getState().runs)).toBe(1);

    // Opening it clears the flag.
    useCodingAgentsStore.getState().setActive(bg);
    expect(useCodingAgentsStore.getState().runs[bg].unseen).toBe(false);
    expect(countUnseen(useCodingAgentsStore.getState().runs)).toBe(0);
  });

  it("does not flag the currently-open run as unseen", async () => {
    const store = useCodingAgentsStore.getState();
    const runId = await store.startRun({
      backend: "claude",
      prompt: "go",
      cwd: "/r",
    });
    useCodingAgentsStore.getState().setActive(runId);
    useCodingAgentsStore.getState().ingest(runId, { type: "turn-end" });
    expect(useCodingAgentsStore.getState().runs[runId].unseen).toBeFalsy();
  });

  it("queues a follow-up while busy and auto-sends it when the turn ends", async () => {
    const store = useCodingAgentsStore.getState();
    const runId = await store.startRun({
      backend: "claude",
      prompt: "go",
      cwd: "/r",
    });
    // Drive the run into a running (busy) state.
    store.ingest(runId, { type: "session", sessionId: "s1" });
    expect(isRunBusy(useCodingAgentsStore.getState().runs[runId].status)).toBe(
      true,
    );

    // A follow-up while busy is queued, not sent.
    await useCodingAgentsStore.getState().sendInput(runId, "next thing");
    expect(useCodingAgentsStore.getState().runs[runId].queuedInput).toBe(
      "next thing",
    );
    const sendCallsBefore = client.sendAgentInput.mock.calls.length;

    // Turn completes → the queue flushes and actually sends.
    useCodingAgentsStore.getState().ingest(runId, { type: "turn-end" });
    await Promise.resolve();
    await Promise.resolve();
    expect(
      useCodingAgentsStore.getState().runs[runId].queuedInput,
    ).toBeUndefined();
    expect(client.sendAgentInput.mock.calls.length).toBe(sendCallsBefore + 1);
    expect(client.sendAgentInput).toHaveBeenLastCalledWith(
      runId,
      "next thing",
      {
        model: undefined,
        permissionMode: "default",
        effort: undefined,
      },
    );
  });

  it("threads always through to approveAgentTool", async () => {
    const runId = await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "go",
      cwd: "/r",
    });
    useCodingAgentsStore.getState().ingest(runId, {
      type: "approval-request",
      approvalId: "ap9",
      toolCallId: "t9",
      name: "bash",
      input: {},
    });
    await useCodingAgentsStore
      .getState()
      .respondApproval(runId, "ap9", true, true);
    expect(client.approveAgentTool).toHaveBeenCalledWith(runId, "ap9", true, {
      always: true,
    });
  });

  it("openSession folds a saved transcript into a read-only history run", async () => {
    client.loadSessionEvents.mockResolvedValueOnce([
      { type: "user-message", text: "fix the bug" },
      { type: "message-start" },
      { type: "text", text: "Done." },
      { type: "message-end" },
    ]);
    const runId = await useCodingAgentsStore.getState().openSession({
      sessionId: "cc-1",
      backend: "claude",
      projectSlug: "-repo",
      name: "Fix the bug",
      cwd: "/repo",
      updatedAt: 42,
      messageCount: 2,
    });
    expect(runId).toBe("hist:claude:cc-1");
    const run = useCodingAgentsStore.getState().runs[runId];
    expect(run.status).toBe("done"); // read-only
    expect(run.sessionId).toBe("cc-1");
    expect(run.cwd).toBe("/repo"); // restored from the summary (not null)
    expect(run.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect((run.messages[1].parts[0] as { text: string }).text).toBe("Done.");
    expect(useCodingAgentsStore.getState().activeRunId).toBe(runId);
  });

  it("startRun forwards resumeSessionId to the backend", async () => {
    await useCodingAgentsStore.getState().startRun({
      backend: "claude",
      prompt: "go",
      cwd: "/r",
      resumeSessionId: "prev-123",
    });
    expect(client.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: "prev-123", cwd: "/r" }),
      expect.any(Function),
    );
  });

  it("resumeSession spawns a live run that resumes the session, seeding history", async () => {
    // Open a read-only history run first.
    client.loadSessionEvents.mockResolvedValueOnce([
      { type: "user-message", text: "earlier" },
      { type: "message-start" },
      { type: "text", text: "prior reply" },
      { type: "message-end" },
    ]);
    const histId = await useCodingAgentsStore.getState().openSession({
      sessionId: "cc-7",
      backend: "claude",
      projectSlug: "-repo",
      name: "Old task",
      cwd: "/repo",
      updatedAt: 9,
      messageCount: 2,
    });

    const newId = await useCodingAgentsStore
      .getState()
      .resumeSession(histId, "keep going", { kind: "local" });
    expect(newId).toMatch(/^run-/);
    const run = useCodingAgentsStore.getState().runs[newId as string];
    // Prior transcript seeded + the new user message appended.
    expect(run.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(run.cwd).toBe("/repo");
    expect(run.sessionId).toBe("cc-7");
    expect(client.startRun).toHaveBeenLastCalledWith(
      expect.objectContaining({
        backend: "claude",
        prompt: "keep going",
        cwd: "/repo",
        resumeSessionId: "cc-7",
      }),
      expect.any(Function),
    );
  });

  it("loadSessions populates the global history list", async () => {
    client.listAllSessions.mockResolvedValueOnce([
      {
        sessionId: "a",
        backend: "claude",
        projectSlug: "-r",
        name: "One",
        cwd: "/r",
        updatedAt: 2,
        messageCount: 5,
      },
    ]);
    await useCodingAgentsStore.getState().loadSessions();
    expect(useCodingAgentsStore.getState().sessions).toHaveLength(1);
    expect(useCodingAgentsStore.getState().sessions[0].name).toBe("One");
  });

  it("remove drops the run and reassigns the active id", async () => {
    const a = await useCodingAgentsStore
      .getState()
      .startRun({ backend: "claude", prompt: "a", cwd: "/r", now: 1 });
    const b = await useCodingAgentsStore
      .getState()
      .startRun({ backend: "claude", prompt: "b", cwd: "/r", now: 2 });
    useCodingAgentsStore.getState().setActive(b);
    useCodingAgentsStore.getState().remove(b);
    const st = useCodingAgentsStore.getState();
    expect(st.runs[b]).toBeUndefined();
    expect(st.activeRunId).toBe(a);
  });
});
