import { describe, expect, it, vi } from "vitest";
import type { AgentEvent, AgentRunStartParams } from "@termco/agents-base";
import { type ChildLike, createCodingAgentDriver, type SpawnFn } from "./driver";

/** A controllable fake child process. */
function makeFakeChild() {
  const handlers: {
    data?: (c: unknown) => void;
    err?: (c: unknown) => void;
    close?: (c: number | null) => void;
    error?: (e: Error) => void;
  } = {};
  const child: ChildLike & {
    emitData: (s: string) => void;
    emitStderr: (s: string) => void;
    emitClose: (code: number) => void;
    emitError: (e: Error) => void;
    killed: boolean;
  } = {
    killed: false,
    stdout: { on: (_e, cb) => { handlers.data = cb; } },
    stderr: { on: (_e, cb) => { handlers.err = cb; } },
    on(event, cb) {
      if (event === "close") handlers.close = cb as (c: number | null) => void;
      if (event === "error") handlers.error = cb as (e: Error) => void;
    },
    kill() {
      this.killed = true;
    },
    emitData(s: string) {
      handlers.data?.(s);
    },
    emitStderr(s: string) {
      handlers.err?.(s);
    },
    emitClose(code: number) {
      handlers.close?.(code);
    },
    emitError(e: Error) {
      handlers.error?.(e);
    },
  };
  return child;
}

const PARAMS: AgentRunStartParams = {
  runId: "r1",
  backend: "claude",
  prompt: "do it",
  cwd: "/repo",
};

function line(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

describe("coding-agent driver", () => {
  it("spawns the backend and streams normalized events", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = vi.fn((_bin, _args, _opts) => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    });
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p", "do it", "--output-format", "stream-json"]),
      expect.objectContaining({ cwd: "/repo" }),
    );

    const c = children[0];
    c.emitData(line({ type: "system", subtype: "init", session_id: "s1", model: "opus" }));
    c.emitData(line({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));
    c.emitData(line({ type: "result", subtype: "success", total_cost_usd: 0.001 }));
    c.emitClose(0);

    expect(events.map((e) => e.type)).toEqual([
      "session",
      "message-start",
      "text",
      "message-end",
      "turn-end",
    ]);
    // Normal turn boundary: run stays alive (no exit), ready for a follow-up.
    expect(driver.activeRunIds()).toEqual(["r1"]);
  });

  it("forwards the run's workspace to the spawn seam (for ssh routing)", () => {
    const seen: unknown[] = [];
    const spawn: SpawnFn = (_bin, _args, opts) => {
      seen.push(opts.workspace);
      return makeFakeChild();
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const ws = { kind: "ssh" as const, connectionId: "prod", host: "h", user: "u" };
    driver.startRun({ ...PARAMS, workspace: ws }, () => {});
    expect(seen[0]).toEqual(ws);
  });

  it("resumes the session for a follow-up turn", () => {
    const argsSeen: string[][] = [];
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = (_bin, args) => {
      argsSeen.push(args);
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    children[0].emitData(line({ type: "system", subtype: "init", session_id: "s1" }));
    children[0].emitData(line({ type: "result", subtype: "success" }));
    children[0].emitClose(0);

    const ok = driver.sendInput("r1", "now do more");
    expect(ok).toBe(true);
    // Second turn resumes the captured session id and carries the new prompt.
    expect(argsSeen[1]).toContain("--resume");
    expect(argsSeen[1]).toContain("s1");
    expect(argsSeen[1]).toContain("now do more");
  });

  it("applies per-turn overrides (model/mode/effort) to the next spawn", () => {
    const argsSeen: string[][] = [];
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = (_bin, args) => {
      argsSeen.push(args);
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    children[0].emitData(
      line({ type: "system", subtype: "init", session_id: "s1" }),
    );
    children[0].emitData(line({ type: "result", subtype: "success" }));
    children[0].emitClose(0);

    driver.sendInput("r1", "again", {
      model: "opus",
      permissionMode: "plan",
      effort: "high",
    });
    // The rebuilt argv carries the changed model + permission mode.
    expect(argsSeen[1]).toContain("--model");
    expect(argsSeen[1]).toContain("opus");
    expect(argsSeen[1]).toContain("--permission-mode");
    expect(argsSeen[1]).toContain("plan");
    // The override persists to a further turn without being re-specified.
    children[1].emitData(line({ type: "result", subtype: "success" }));
    children[1].emitClose(0);
    driver.sendInput("r1", "more");
    expect(argsSeen[2]).toContain("opus");
  });

  it("refuses a follow-up while a turn is still running", () => {
    const spawn: SpawnFn = () => makeFakeChild();
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    // No close emitted → child still running.
    expect(driver.sendInput("r1", "x")).toBe(false);
  });

  it("abort kills the child and finalizes the run with an exit", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));
    driver.abortRun("r1");
    expect(children[0].killed).toBe(true);
    children[0].emitClose(143);
    expect(events.at(-1)).toEqual({ type: "exit", code: 143, aborted: true });
    expect(driver.activeRunIds()).toEqual([]);
  });

  it("surfaces a mid-turn crash as a fatal error + exit", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));
    // Close with non-zero and no prior result → crash.
    children[0].emitClose(1);
    expect(events.map((e) => e.type)).toEqual(["error", "exit"]);
    expect(driver.activeRunIds()).toEqual([]);
  });

  it("surfaces stderr and never hangs when the child exits 0 without a result", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));
    // Auth failure printed to stderr, then a clean exit with no `result`.
    children[0].emitStderr("Invalid API key · Please run /login");
    children[0].emitClose(0);
    expect(events).toEqual([
      { type: "error", message: "Invalid API key · Please run /login", fatal: true },
      { type: "exit", code: 0 },
    ]);
    expect(driver.activeRunIds()).toEqual([]);
  });

  it("lists live runs and resubscribes replays the buffered events", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    children[0].emitData(line({ type: "system", subtype: "init", session_id: "s1" }));
    children[0].emitData(line({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }));

    // A reload can't see the run; listRuns surfaces it.
    const summary = driver.listRuns();
    expect(summary).toEqual([
      { runId: "r1", backend: "claude", prompt: "do it", cwd: "/repo", sessionId: "s1", running: true },
    ]);

    // A run's workspace rides along on the summary (reload keeps the host).
    const ssh = { kind: "ssh" as const, connectionId: "c1", host: "h", user: "u" };
    driver.startRun({ ...PARAMS, runId: "r2", workspace: ssh }, () => {});
    expect(driver.listRuns().find((r) => r.runId === "r2")?.workspace).toEqual(ssh);

    // Resubscribing replays every buffered event to the new sink.
    const replayed: AgentEvent[] = [];
    expect(driver.resubscribe("r1", (e) => replayed.push(e))).toBe(true);
    expect(replayed.map((e) => e.type)).toEqual([
      "session",
      "message-start",
      "text",
      "message-end",
    ]);
    // And new events now flow to the NEW sink.
    children[0].emitData(line({ type: "result", subtype: "success" }));
    expect(replayed.at(-1)).toEqual({ type: "turn-end", usage: undefined, costUsd: undefined });
  });

  it("requestApproval emits an approval-request and resolves on decision", async () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));

    const decision = driver.requestApproval("r1", { name: "bash", input: { command: "ls" } });
    const req = events.find((e) => e.type === "approval-request");
    expect(req).toMatchObject({ type: "approval-request", name: "bash" });
    const approvalId = (req as { approvalId: string }).approvalId;

    driver.resolveApproval(approvalId, { allow: true, updatedInput: { command: "ls -la" } });
    await expect(decision).resolves.toEqual({ allow: true, updatedInput: { command: "ls -la" } });
  });

  it("allow-&-remember auto-approves a matching later tool call", async () => {
    const spawn: SpawnFn = () => makeFakeChild();
    const driver = createCodingAgentDriver({ spawn, env: {}, approvalTimeoutMs: 0 });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));

    const first = driver.requestApproval("r1", { name: "Bash", input: { command: "npm test" } });
    const approvalId = (events.find((e) => e.type === "approval-request") as { approvalId: string }).approvalId;
    driver.resolveApproval(approvalId, { allow: true, always: true });
    await expect(first).resolves.toMatchObject({ allow: true });

    // A second `npm ...` call matches the remembered Bash(npm:*) rule → auto-allow,
    // with NO new approval-request emitted.
    const before = events.filter((e) => e.type === "approval-request").length;
    const second = driver.requestApproval("r1", { name: "Bash", input: { command: "npm run build" } });
    await expect(second).resolves.toEqual({ allow: true });
    expect(events.filter((e) => e.type === "approval-request").length).toBe(before);

    // A different tool still prompts.
    const third = driver.requestApproval("r1", { name: "Write", input: { file_path: "/x" } });
    expect(events.filter((e) => e.type === "approval-request").length).toBe(before + 1);
    void third;
  });

  it("acceptEdits auto-approves edit tools without a card, still prompts for Bash", async () => {
    const spawn: SpawnFn = () => makeFakeChild();
    const driver = createCodingAgentDriver({ spawn, env: {}, approvalTimeoutMs: 0 });
    const events: AgentEvent[] = [];
    driver.startRun({ ...PARAMS, permissionMode: "acceptEdits" }, (e) => events.push(e));

    // The hook intercepts Edit even in acceptEdits mode (one matcher for every
    // hooked mode); the driver must mirror the backend's auto-approval.
    await expect(
      driver.requestApproval("r1", { name: "Edit", input: { file_path: "/x" } }),
    ).resolves.toEqual({ allow: true });
    expect(events.some((e) => e.type === "approval-request")).toBe(false);

    // Bash still prompts in acceptEdits.
    void driver.requestApproval("r1", { name: "Bash", input: { command: "ls" } });
    expect(events.some((e) => e.type === "approval-request")).toBe(true);
  });

  it("applies a live global auto-run resolver before emitting approval cards", async () => {
    let autoRun = true;
    const driver = createCodingAgentDriver({
      spawn: () => makeFakeChild(),
      env: {},
      approvalTimeoutMs: 0,
      autoApprove: (_runId, request) =>
        autoRun && request.input !== "catastrophic",
    });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (event) => events.push(event));

    await expect(driver.requestApproval("r1", {
      name: "Write",
      input: { file_path: "/repo/a.ts" },
    })).resolves.toEqual({ allow: true });
    expect(events.some((event) => event.type === "approval-request")).toBe(false);

    autoRun = false;
    void driver.requestApproval("r1", { name: "Write", input: {} });
    expect(events.some((event) => event.type === "approval-request")).toBe(true);
  });

  it("auto-denies and emits approval-cancelled on timeout", async () => {
    vi.useFakeTimers();
    try {
      const spawn: SpawnFn = () => makeFakeChild();
      const driver = createCodingAgentDriver({ spawn, env: {}, approvalTimeoutMs: 1000 });
      const events: AgentEvent[] = [];
      driver.startRun(PARAMS, (e) => events.push(e));
      const decision = driver.requestApproval("r1", { name: "Bash", input: { command: "rm -rf /" } });
      vi.advanceTimersByTime(1001);
      await expect(decision).resolves.toMatchObject({ allow: false });
      expect(events.some((e) => e.type === "approval-cancelled" && e.reason === "timeout")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("denies pending approvals when the run ends", async () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun(PARAMS, () => {});
    const decision = driver.requestApproval("r1", { name: "bash" });
    driver.abortRun("r1");
    children[0].emitClose(143);
    await expect(decision).resolves.toMatchObject({ allow: false });
  });

  it("resubscribe returns false for an unknown run", () => {
    const driver = createCodingAgentDriver({ spawn: () => makeFakeChild(), env: {} });
    expect(driver.resubscribe("ghost", () => {})).toBe(false);
  });

  it("killAll SIGTERMs every live child and clears the runs", () => {
    const children: ReturnType<typeof makeFakeChild>[] = [];
    const spawn: SpawnFn = () => {
      const c = makeFakeChild();
      children.push(c);
      return c;
    };
    const driver = createCodingAgentDriver({ spawn, env: {} });
    driver.startRun({ ...PARAMS, runId: "a" }, () => {});
    driver.startRun({ ...PARAMS, runId: "b" }, () => {});
    driver.killAll();
    expect(children.every((c) => c.killed)).toBe(true);
    expect(driver.activeRunIds()).toEqual([]);
  });

  it("propagates a spawn 'error' event as fatal and clears the run", () => {
    const child = makeFakeChild();
    const spawn: SpawnFn = () => child;
    const driver = createCodingAgentDriver({ spawn, env: {} });
    const events: AgentEvent[] = [];
    driver.startRun(PARAMS, (e) => events.push(e));
    child.emitError(new Error("ENOENT: claude not found"));
    expect(events).toEqual([
      { type: "error", message: "ENOENT: claude not found", fatal: true },
      { type: "exit", code: -1 },
    ]);
    expect(driver.activeRunIds()).toEqual([]);
  });
});
// Owned by the coding-agent-native provider plugin.
