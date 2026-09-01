import { describe, expect, it, vi } from "vitest";
import {
  ApprovalId,
  RequestId,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
  type AppendSessionEvent,
  type SessionHistoryCapability,
} from "@termco/session-base";
import type { AiToolDefinition } from "@termco/ai-tools-base";
import { createAiToolExecutor } from "./executor";

function call(name = "write_file") {
  return {
    sessionId: SessionId("session-a"),
    turn: TurnId(1),
    step: StepId(1),
    requestId: RequestId("request-a"),
    callId: ToolCallId("call-a"),
    name,
    input: { path: "notes.md" },
    contributor: { pluginId: "files", contributionId: "files" },
  } as const;
}

function history(log: string[]) {
  const batches: AppendSessionEvent[][] = [];
  const creates: Array<{ header: unknown; seed?: readonly AppendSessionEvent[] }> = [];
  const create = vi.fn(async (input: { header: unknown; seed?: readonly AppendSessionEvent[] }) => {
    log.push(`create:${input.seed?.map((event) => event.type).join(",")}`);
    creates.push(input);
    return undefined as never;
  });
  const append = vi.fn(async (
    _sessionId: ReturnType<typeof SessionId>,
    events: readonly AppendSessionEvent[],
    options?: { durability?: string },
  ) => {
    log.push(`append:${events.map((event) => event.type).join(",")}:${options?.durability}`);
    batches.push([...events]);
    return undefined as never;
  });
  const readWindow = vi.fn(async () => ({
    header: {
      formatVersion: 2,
      id: SessionId("session-a"),
      createdAt: 1,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    },
    events: [],
    revision: SessionRevision(0),
    loadedRange: { start: 0, end: 0 },
    availability: { earlier: false, later: false },
    fidelity: "full",
    repair: { state: "healthy" },
  }));
  return {
    capability: { create, append, readWindow } as unknown as SessionHistoryCapability,
    create,
    append,
    batches,
    creates,
  };
}

function durableHistory() {
  const events: Array<AppendSessionEvent & { seq: ReturnType<typeof SessionSeq> }> = [];
  const append = vi.fn(async (
    _sessionId: ReturnType<typeof SessionId>,
    incoming: readonly AppendSessionEvent[],
  ) => {
    for (const event of incoming) {
      events.push({ ...event, seq: SessionSeq(events.length + 1) });
    }
    return undefined as never;
  });
  const readWindow = vi.fn(async () => ({
    header: {
      formatVersion: 2,
      id: SessionId("session-a"),
      createdAt: 1,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    },
    events,
    revision: SessionRevision(events.length),
    loadedRange: { start: 1, end: events.length },
    availability: { earlier: false, later: false },
    fidelity: "full",
    repair: { state: "healthy" },
  }));
  return {
    capability: { append, readWindow } as unknown as SessionHistoryCapability,
    append,
    readWindow,
    events,
  };
}

function definition(execute: AiToolDefinition["execute"]): AiToolDefinition {
  return {
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
    execute,
    toModelOutput: ({ output }) => ({
      type: "content",
      value: [{ type: "text", text: JSON.stringify(output) }],
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("current AI tool executor", () => {
  it("coalesces concurrent observations of one call into one durable write", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const append = vi.fn(async () => { await blocked; });
    const executor = createAiToolExecutor({
      history: { append } as unknown as SessionHistoryCapability,
    });

    const first = executor.recordCall(call());
    const second = executor.recordCall(call());
    expect(append).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it("rehydrates a durable call before completing it in a fresh executor", async () => {
    const persisted = durableHistory();
    const first = createAiToolExecutor({ history: persisted.capability, now: () => 10 });
    await first.recordCall({ ...call(), concurrency: "exclusive" });

    const fresh = createAiToolExecutor({ history: persisted.capability, now: () => 20 });
    const result = await fresh.complete({
      ...call(),
      definition: definition(vi.fn()),
      output: { saved: true },
      startedAt: 15,
    });

    expect(result).toMatchObject({ ok: true, output: { saved: true } });
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
    expect(persisted.readWindow).toHaveBeenCalledWith(
      SessionId("session-a"),
      { kind: "tail", limit: 256 },
    );
  });

  it("rehydrates a durable approval request before recording its decision", async () => {
    const persisted = durableHistory();
    const first = createAiToolExecutor({ history: persisted.capability });
    const selected = definition(() => null);
    selected.needsApproval = true;
    const selectedCall = { ...call(), concurrency: "exclusive" as const };
    const resolution = await first.resolveApproval({
      definition: selected,
      input: selectedCall.input,
      mode: "ask",
    });
    const approvalId = ApprovalId("approval-rehydrated");
    await first.recordApprovalRequest({ call: selectedCall, approvalId, resolution });

    const fresh = createAiToolExecutor({ history: persisted.capability });
    await fresh.recordApprovalDecision({
      call: selectedCall,
      approvalId,
      outcome: "allowed-once",
      responder: "user",
    });
    const restartedAgain = createAiToolExecutor({ history: persisted.capability });
    await restartedAgain.recordApprovalDecision({
      call: selectedCall,
      approvalId,
      outcome: "allowed-once",
      responder: "user",
    });

    expect(persisted.events.map((event) => event.type)).toEqual([
      "tool/call",
      "approval/request",
      "approval/decision",
    ]);
  });

  it("rejects a fresh completion when the durable call identity conflicts", async () => {
    const persisted = durableHistory();
    const first = createAiToolExecutor({ history: persisted.capability });
    await first.recordCall({ ...call("read_file"), concurrency: "exclusive" });

    const fresh = createAiToolExecutor({ history: persisted.capability });
    await expect(fresh.complete({
      ...call("write_file"),
      definition: definition(vi.fn()),
      output: null,
    })).rejects.toMatchObject({ code: "PERSISTED_CALL_MISMATCH" });
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call"]);
  });

  it("coalesces the same terminal denial in one executor and rejects a conflicting outcome", async () => {
    const persisted = durableHistory();
    const executor = createAiToolExecutor({ history: persisted.capability, now: () => 30 });
    const denied = {
      ...call(),
      definition: definition(vi.fn()),
      error: {
        name: "ToolApprovalRejected",
        code: "TOOL_DENIED",
        message: "User declined tool execution",
      },
    } as const;

    const [first, repeated] = await Promise.all([
      executor.complete(denied),
      executor.complete(denied),
    ]);

    expect(repeated).toEqual(first);
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
    await expect(executor.complete({
      ...call(),
      definition: definition(vi.fn()),
      output: { accepted: true },
    })).rejects.toMatchObject({ code: "TOOL_RESULT_MISMATCH" });
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
  });

  it("rehydrates the same canonical terminal result and rejects a conflicting fresh completion", async () => {
    const persisted = durableHistory();
    const denied = {
      ...call(),
      definition: definition(vi.fn()),
      error: {
        name: "ToolApprovalRejected",
        code: "TOOL_DENIED",
        message: "User declined tool execution",
      },
    } as const;
    const first = createAiToolExecutor({ history: persisted.capability, now: () => 40 });
    await first.complete(denied);

    const fresh = createAiToolExecutor({ history: persisted.capability, now: () => 50 });
    await expect(fresh.complete(denied)).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_DENIED" },
    });
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);

    const conflicting = createAiToolExecutor({ history: persisted.capability, now: () => 60 });
    await expect(conflicting.complete({
      ...call(),
      definition: definition(vi.fn()),
      error: {
        name: "ToolApprovalRejected",
        code: "TOOL_DENIED",
        message: "Different terminal reason",
      },
    })).rejects.toMatchObject({ code: "TOOL_RESULT_MISMATCH" });
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
  });

  it("single-flights duplicate execute calls so the side effect runs once", async () => {
    const persisted = durableHistory();
    const release = deferred<unknown>();
    const body = vi.fn(() => release.promise);
    const executor = createAiToolExecutor({ history: persisted.capability });
    const input = { ...call(), definition: definition(body) };

    const first = executor.execute(input);
    const duplicate = executor.execute(input);
    await vi.waitFor(() => expect(body).toHaveBeenCalledOnce());
    release.resolve({ saved: true });

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      expect.objectContaining({ ok: true, output: { saved: true } }),
      expect.objectContaining({ ok: true, output: { saved: true } }),
    ]);
    expect(body).toHaveBeenCalledOnce();
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
  });

  it("returns an in-memory completed denial from execute without invoking the tool body", async () => {
    const persisted = durableHistory();
    const executor = createAiToolExecutor({ history: persisted.capability });
    const denied = {
      ...call(),
      definition: definition(vi.fn()),
      error: {
        name: "ToolApprovalRejected",
        code: "TOOL_DENIED",
        message: "User declined tool execution",
      },
    } as const;
    const terminal = await executor.complete(denied);
    const body = vi.fn();

    await expect(executor.execute({
      ...call(),
      definition: definition(body),
    })).resolves.toEqual(terminal);
    expect(body).not.toHaveBeenCalled();
    expect(persisted.events.map((event) => event.type)).toEqual(["tool/call", "tool/result"]);
  });

  it("rehydrates a durable terminal result before execute and keeps later conflicts structured", async () => {
    const persisted = durableHistory();
    const first = createAiToolExecutor({ history: persisted.capability });
    await first.complete({
      ...call(),
      definition: definition(vi.fn()),
      output: { already: "done" },
    });
    const body = vi.fn();
    const fresh = createAiToolExecutor({ history: persisted.capability });

    await expect(fresh.execute({
      ...call(),
      definition: definition(body),
    })).resolves.toMatchObject({ ok: true, output: { already: "done" } });
    expect(body).not.toHaveBeenCalled();
    const nextBody = vi.fn(async () => ({ next: true }));
    await expect(fresh.execute({
      ...call("next_tool"),
      callId: ToolCallId("call-b"),
      definition: definition(nextBody),
    })).resolves.toMatchObject({ ok: true, output: { next: true } });
    expect(nextBody).toHaveBeenCalledOnce();
    await expect(fresh.complete({
      ...call(),
      definition: definition(vi.fn()),
      output: { different: true },
    })).rejects.toMatchObject({ code: "TOOL_RESULT_MISMATCH" });
    expect(persisted.events.map((event) => event.type)).toEqual([
      "tool/call",
      "tool/result",
      "tool/call",
      "tool/result",
    ]);
  });

  it("flushes the canonical call before the side effect and records normalized output", async () => {
    const log: string[] = [];
    const persisted = history(log);
    const execute = vi.fn(async () => {
      log.push("effect");
      return { ok: true, path: "notes.md" };
    });
    const executor = createAiToolExecutor({ history: persisted.capability, now: () => 50 });

    const result = await executor.execute({ ...call(), definition: definition(execute) });

    expect(log).toEqual([
      "append:tool/call:flushed",
      "effect",
      "append:tool/result:flushed",
    ]);
    expect(result).toMatchObject({
      ok: true,
      output: { ok: true, path: "notes.md" },
      modelContent: {
        type: "content",
        value: [{ type: "text", text: '{"ok":true,"path":"notes.md"}' }],
      },
    });
    expect(persisted.batches[1]?.[0]).toMatchObject({
      type: "tool/result",
      data: {
        callId: ToolCallId("call-a"),
        canonicalOutput: { ok: true, path: "notes.md" },
        timing: { startedAt: 50, endedAt: 50 },
      },
    });
  });

  it("overlaps bounded safe bodies, barriers exclusive bodies, and commits results in model order", async () => {
    const committed: string[] = [];
    const append = vi.fn(async (
      _sessionId: ReturnType<typeof SessionId>,
      events: readonly AppendSessionEvent[],
    ) => {
      for (const event of events) {
        if (event.type === "tool/result") committed.push(String(event.data.callId));
      }
    });
    const readWindow = vi.fn(async () => ({
      header: {
        formatVersion: 2,
        id: SessionId("session-a"),
        createdAt: 1,
        authority: "v2",
        backend: "chat",
        fidelity: "full",
      },
      events: [],
      revision: SessionRevision(0),
      loadedRange: { start: 0, end: 0 },
      availability: { earlier: false, later: false },
      fidelity: "full",
      repair: { state: "healthy" },
    }));
    const executor = createAiToolExecutor({
      history: { append, readWindow } as unknown as SessionHistoryCapability,
      maxSafeConcurrency: 2,
    });
    const firstDone = deferred<unknown>();
    const secondDone = deferred<unknown>();
    const exclusiveDone = deferred<unknown>();
    const started: string[] = [];
    const tool = (
      id: string,
      concurrency: "safe" | "exclusive",
      completion: ReturnType<typeof deferred<unknown>>,
    ): AiToolDefinition => ({
      ...definition(async () => {
        started.push(id);
        return completion.promise;
      }),
      concurrency,
    });
    const execution = (
      id: string,
      definition: AiToolDefinition,
    ) => executor.execute({
      ...call(id),
      callId: ToolCallId(id),
      name: id,
      definition,
    });

    const first = execution("call-1", tool("call-1", "safe", firstDone));
    const second = execution("call-2", tool("call-2", "safe", secondDone));
    const exclusive = execution(
      "call-3",
      tool("call-3", "exclusive", exclusiveDone),
    );
    await vi.waitFor(() => expect(started).toEqual(["call-1", "call-2"]));

    secondDone.resolve({ order: 2 });
    await Promise.resolve();
    expect(committed).toEqual([]);
    expect(started).toEqual(["call-1", "call-2"]);

    firstDone.resolve({ order: 1 });
    await vi.waitFor(() => expect(started).toEqual(["call-1", "call-2", "call-3"]));
    expect(committed).toEqual(["call-1", "call-2"]);

    exclusiveDone.resolve({ order: 3 });
    await Promise.all([first, second, exclusive]);
    expect(committed).toEqual(["call-1", "call-2", "call-3"]);
  });

  it("never starts more safe bodies than the configured session pool", async () => {
    const executor = createAiToolExecutor({
      history: history([]).capability,
      maxSafeConcurrency: 2,
    });
    const releases = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    const started: string[] = [];
    const executions = releases.map((release, index) => {
      const id = `safe-${index + 1}`;
      const selected = definition(async () => {
        started.push(id);
        return release.promise;
      });
      selected.concurrency = "safe";
      return executor.execute({
        ...call(id),
        callId: ToolCallId(id),
        name: id,
        definition: selected,
      });
    });

    await vi.waitFor(() => expect(started).toEqual(["safe-1", "safe-2"]));
    releases[1]!.resolve({ done: 2 });
    await vi.waitFor(() => expect(started).toEqual(["safe-1", "safe-2", "safe-3"]));
    releases[0]!.resolve({ done: 1 });
    releases[2]!.resolve({ done: 3 });
    await Promise.all(executions);
  });

  it("never invokes an invalid call and stores one structured terminal result", async () => {
    const persisted = history([]);
    const execute = vi.fn();
    const executor = createAiToolExecutor({ history: persisted.capability, now: () => 75 });

    const result = await executor.execute({
      ...call(),
      input: { path: 42 },
      definition: definition(execute),
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", name: "AiToolExecutionError" },
    });
    expect(persisted.batches.map((batch) => batch.map((event) => event.type)))
      .toEqual([["tool/call"], ["tool/result"]]);
    expect(persisted.batches[1]?.[0]).toMatchObject({
      type: "tool/result",
      data: {
        error: { code: "INVALID_INPUT", name: "AiToolExecutionError" },
      },
    });
  });

  it("records a thrown implementation error and cancellation without losing the call", async () => {
    const thrownHistory = history([]);
    const thrown = createAiToolExecutor({ history: thrownHistory.capability, now: () => 100 });
    const failure = await thrown.execute({
      ...call(),
      definition: definition(async () => {
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      }),
    });
    expect(failure).toMatchObject({
      ok: false,
      error: { code: "ENOSPC", message: "disk full" },
    });

    const cancelledHistory = history([]);
    const cancelled = createAiToolExecutor({ history: cancelledHistory.capability, now: () => 200 });
    const signal = AbortSignal.abort("user stopped");
    const cancellation = await cancelled.execute({
      ...call(),
      definition: definition(vi.fn()),
      signal,
    });
    expect(cancellation).toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_STARTED", name: "ToolNotStarted" },
    });
    expect(cancelledHistory.batches.map((batch) => batch[0]?.type))
      .toEqual(["tool/call", "tool/result"]);
  });

  it("settles an in-flight tool at the executor deadline and commits one typed timeout result", async () => {
    vi.useFakeTimers();
    try {
      const persisted = history([]);
      const executor = createAiToolExecutor({
        history: persisted.capability,
        now: () => Date.now(),
        toolTimeoutMs: 25,
      });
      const timed: AiToolDefinition = {
        ...definition(() => new Promise(() => undefined)),
      };
      let result: Awaited<ReturnType<typeof executor.execute>> | undefined;
      void executor.execute({ ...call(), definition: timed }).then((value) => {
        result = value;
      });

      await vi.advanceTimersByTimeAsync(25);

      expect(result).toMatchObject({
        ok: false,
        error: { name: "TimeoutError", code: "TIMEOUT" },
      });
      expect(persisted.batches.map((batch) => batch[0]?.type))
        .toEqual(["tool/call", "tool/result"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates in-flight session cancellation and commits one cancelled result", async () => {
    const persisted = history([]);
    const executor = createAiToolExecutor({ history: persisted.capability });
    const controller = new AbortController();
    let bodyStarted = false;
    const running = definition(() => {
      bodyStarted = true;
      return new Promise(() => undefined);
    });
    const result = executor.execute({
      ...call(),
      definition: running,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(bodyStarted).toBe(true));

    controller.abort("user stopped the session");

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: {
        code: "CANCELLED",
        message: "user stopped the session",
      },
    });
    expect(persisted.batches.map((batch) => batch[0]?.type))
      .toEqual(["tool/call", "tool/result"]);
  });

  it("drains started work and records queued calls as not started on cancellation", async () => {
    const persisted = history([]);
    const executor = createAiToolExecutor({
      history: persisted.capability,
      maxSafeConcurrency: 1,
    });
    const controller = new AbortController();
    let firstStarted = false;
    const firstBody = vi.fn(() => {
      firstStarted = true;
      return new Promise(() => undefined);
    });
    const secondBody = vi.fn(async () => "must not run");
    const firstDefinition = definition(firstBody);
    firstDefinition.concurrency = "safe";
    const secondDefinition = definition(secondBody);
    secondDefinition.concurrency = "safe";

    const first = executor.execute({
      ...call("call-1"),
      callId: ToolCallId("call-1"),
      definition: firstDefinition,
      signal: controller.signal,
    });
    const second = executor.execute({
      ...call("call-2"),
      callId: ToolCallId("call-2"),
      definition: secondDefinition,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(firstStarted).toBe(true));

    controller.abort("session stopped");

    await expect(first).resolves.toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
    await expect(second).resolves.toMatchObject({
      ok: false,
      error: { code: "TOOL_NOT_STARTED" },
    });
    expect(secondBody).not.toHaveBeenCalled();
    expect(persisted.batches
      .flatMap((batch) => batch)
      .filter((event) => event.type === "tool/result")
      .map((event) => (event.data as { callId: string }).callId))
      .toEqual(["call-1", "call-2"]);
  });

  it("uses one approval policy for ask, auto-run, mandatory approval, and deny", async () => {
    const executor = createAiToolExecutor({ history: history([]).capability });
    const normal = definition(() => null);
    normal.needsApproval = true;
    const mandatory = definition(() => null);
    mandatory.needsApproval = true;
    mandatory.alwaysNeedsApproval = true;

    await expect(executor.resolveApproval({ definition: normal, input: {}, mode: "ask" }))
      .resolves.toMatchObject({ action: "ask", reason: { kind: "tool-policy" } });
    await expect(executor.resolveApproval({ definition: normal, input: {}, mode: "allow-safe" }))
      .resolves.toMatchObject({ action: "allow", reason: { kind: "auto-run" } });
    await expect(executor.resolveApproval({ definition: mandatory, input: {}, mode: "allow-safe" }))
      .resolves.toMatchObject({ action: "ask", reason: { kind: "mandatory" } });
    await expect(executor.resolveApproval({ definition: normal, input: {}, mode: "deny" }))
      .resolves.toMatchObject({ action: "deny", reason: { kind: "session-policy" } });
  });

  it("single-flights approval ownership and rejects stale or conflicting decisions", async () => {
    const persisted = history([]);
    const executor = createAiToolExecutor({ history: persisted.capability });
    const selected = definition(() => null);
    selected.needsApproval = true;
    const selectedCall = { ...call(), concurrency: "exclusive" as const };
    const resolution = await executor.resolveApproval({
      definition: selected,
      input: selectedCall.input,
      mode: "ask",
    });
    const approvalId = ApprovalId("approval-a");

    await Promise.all([
      executor.recordApprovalRequest({
        call: selectedCall,
        approvalId,
        resolution,
      }),
      executor.recordApprovalRequest({
        call: selectedCall,
        approvalId,
        resolution,
      }),
    ]);
    await Promise.all([
      executor.recordApprovalDecision({
        call: selectedCall,
        approvalId,
        outcome: "allowed-once",
        responder: "user",
      }),
      executor.recordApprovalDecision({
        call: selectedCall,
        approvalId,
        outcome: "allowed-once",
        responder: "user",
      }),
    ]);

    expect(persisted.batches
      .flatMap((batch) => batch)
      .filter((event) => event.type === "approval/request"))
      .toHaveLength(1);
    expect(persisted.batches
      .flatMap((batch) => batch)
      .filter((event) => event.type === "approval/decision"))
      .toHaveLength(1);
    await expect(executor.recordApprovalDecision({
      call: selectedCall,
      approvalId,
      outcome: "rejected",
      responder: "user",
    })).rejects.toMatchObject({ code: "APPROVAL_ALREADY_DECIDED" });
    await expect(executor.recordApprovalDecision({
      call: { ...selectedCall, callId: ToolCallId("different-call") },
      approvalId,
      outcome: "allowed-once",
      responder: "user",
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
    await expect(executor.recordApprovalDecision({
      call: selectedCall,
      approvalId: ApprovalId("unknown-approval"),
      outcome: "allowed-once",
      responder: "user",
    })).rejects.toMatchObject({ code: "STALE_APPROVAL" });
  });

  it("owns the complete canonical lifecycle for a standalone MCP call", async () => {
    const log: string[] = [];
    const persisted = history(log);
    const executor = createAiToolExecutor({
      history: persisted.capability,
      now: () => 300,
      nextSessionId: () => SessionId("mcp-session-a"),
    });

    const result = await executor.executeStandalone({
      backend: "mcp-tool",
      externalRequestId: "mcp-request-a",
      rigId: "rig-a",
      name: "read_file",
      input: { path: "README.md" },
      contributor: { pluginId: "files", contributionId: "files" },
      definition: definition(async () => ({ text: "hello" })),
    });

    expect(result).toMatchObject({
      sessionId: SessionId("mcp-session-a"),
      ok: true,
      output: { text: "hello" },
    });
    expect(log).toEqual([
      "create:session/title,turn/start,step/start,request/header,request/context,request/attempt",
      "append:tool/call:flushed",
      "append:tool/result:flushed",
      "append:step/end,turn/end:flushed",
    ]);
    expect(persisted.creates[0]?.header).toMatchObject({
      id: SessionId("mcp-session-a"),
      backend: "mcp-tool",
      rigId: "rig-a",
      fidelity: "full",
    });
    expect(persisted.creates[0]?.seed?.find((event) => event.type === "request/header"))
      .toMatchObject({
        data: {
          header: {
            fidelity: "full",
            maxSteps: 1,
          },
        },
      });
  });

  it("flushes and records standalone approval before running or denying the body", async () => {
    const log: string[] = [];
    const persisted = history(log);
    const execute = vi.fn(async () => {
      log.push("effect");
      return { ok: true };
    });
    const gated = definition(execute);
    gated.needsApproval = true;
    const executor = createAiToolExecutor({
      history: persisted.capability,
      now: () => 400,
      nextSessionId: () => SessionId("mcp-session-gated"),
    });

    await executor.executeStandalone({
      backend: "mcp-tool",
      externalRequestId: "mcp-request-gated",
      name: "write_file",
      input: { path: "notes.md" },
      contributor: { pluginId: "files" },
      definition: gated,
      authorize: async () => {
        log.push("authorize");
        return { allow: true, outcome: "allowed-once", responder: "user" };
      },
    });

    expect(log).toEqual([
      "create:session/title,turn/start,step/start,request/header,request/context,request/attempt",
      "append:tool/call:flushed",
      "append:approval/request:flushed",
      "authorize",
      "append:approval/decision:flushed",
      "effect",
      "append:tool/result:flushed",
      "append:step/end,turn/end:flushed",
    ]);

    const deniedLog: string[] = [];
    const deniedHistory = history(deniedLog);
    const deniedBody = vi.fn();
    const deniedDefinition = definition(deniedBody);
    deniedDefinition.needsApproval = true;
    const deniedExecutor = createAiToolExecutor({
      history: deniedHistory.capability,
      nextSessionId: () => SessionId("mcp-session-denied"),
    });
    const denied = await deniedExecutor.executeStandalone({
      backend: "mcp-tool",
      externalRequestId: "mcp-request-denied",
      name: "write_file",
      input: { path: "notes.md" },
      contributor: { pluginId: "files" },
      definition: deniedDefinition,
      authorize: async () => ({
        allow: false,
        outcome: "rejected",
        responder: "user",
        message: "user declined",
      }),
    });
    expect(deniedBody).not.toHaveBeenCalled();
    expect(denied).toMatchObject({
      ok: false,
      error: { code: "TOOL_DENIED", message: "user declined" },
    });

    const unnamedDenial = await deniedExecutor.executeStandalone({
      backend: "mcp-tool",
      externalRequestId: "mcp-request-denied-without-message",
      name: "write_file",
      input: { path: "notes.md" },
      contributor: { pluginId: "files" },
      definition: deniedDefinition,
      authorize: async () => ({
        allow: false,
        outcome: "rejected",
        responder: "user",
      }),
    });
    expect(unnamedDenial).toMatchObject({
      ok: false,
      error: { code: "TOOL_DENIED", message: "User declined tool execution" },
    });
  });
});
