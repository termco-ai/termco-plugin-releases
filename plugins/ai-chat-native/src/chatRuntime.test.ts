import { describe, expect, it, vi } from "vitest";
import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type {
  AiToolContribution,
  AiToolExecutionCapability,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import {
  buildSessionToolDefinitions,
  activeSkillFromSteps,
  buildSessionTools,
  configureChatRuntime,
  createSessionStepPersistenceGate,
  createSessionStreamRecorder,
  createSessionTurnClosureGate,
  createToolCallHandleResolver,
  describeSessionTools,
  executeAfterToolPresentation,
  inspectE2EToolDefinitions,
  invokeE2ETool,
  modelValueForSessionToolResult,
  respondToOwnedApproval,
  respondToOwnedInteractiveTool,
  recordedStream,
  sessionDiagnosticForStreamPart,
  stopOwnedChat,
} from "./chatRuntime";
import {
  RequestId,
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
  type SessionHistoryCapability,
} from "@termco/session-base";
import { configureSessionRuntime } from "./runtime";
import { markToolPresentationMounted } from "./toolPresentation";

const workspaceRigs = {
  snapshot: () => ({ hydrated: true, rigs: [], activeId: null }),
} as unknown as WorkspaceRigsCapability;

function toolExecutor(): AiToolExecutionCapability {
  return {
    resolveApproval: vi.fn(async () => ({
      action: "ask" as const,
      policy: { mode: "ask" },
      reason: { kind: "tool-policy" },
    })),
    recordCall: vi.fn(async () => {}),
    recordApprovalRequest: vi.fn(async () => {}),
    recordApprovalDecision: vi.fn(async () => {}),
    complete: vi.fn(async () => ({
      ok: true as const,
      output: null,
      canonicalOutput: null,
      modelContent: { type: "json", value: null },
    })),
    execute: vi.fn(async () => ({
      ok: true as const,
      output: null,
      canonicalOutput: null,
      modelContent: { type: "json", value: null },
    })),
    executeStandalone: vi.fn(async () => ({
      sessionId: "test-session" as never,
      ok: true as const,
      output: null,
      canonicalOutput: null,
      modelContent: { type: "json", value: null },
    })),
  };
}

describe("provider-owned chat runtime", () => {
  it("does not enter an executable tool until its real transcript row committed and painted", async () => {
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const execute = vi.fn(async () => "done");

    const result = executeAfterToolPresentation("call-1", execute);
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();

    const unmount = markToolPresentationMounted("call-1");
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();

    frames.shift()?.(0);
    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();

    frames.shift()?.(16);
    await expect(result).resolves.toBe("done");
    expect(execute).toHaveBeenCalledOnce();
    unmount();
    requestFrame.mockRestore();
  });

  it("keeps a resumed tool call bound to its original canonical request", () => {
    const current = {
      turn: TurnId(1),
      step: StepId(1),
      requestId: RequestId("resume-request"),
    };
    const resolve = createToolCallHandleResolver(() => current, [{
      sessionId: SessionId("session-1"),
      turn: TurnId(1),
      step: StepId(1),
      requestId: RequestId("original-request"),
      callId: ToolCallId("call-1"),
      name: "read_file",
      input: { path: "a.ts" },
      contributor: { pluginId: "files", contributionId: "files" },
    }]);

    expect(resolve("call-1")).toEqual({
      turn: TurnId(1),
      step: StepId(1),
      requestId: RequestId("original-request"),
    });
    expect(resolve("new-call")).toBe(current);
  });

  it("does not open a new turn until Stop has durably closed the previous turn", async () => {
    const gate = createSessionTurnClosureGate();
    const active = gate.open("session-1");
    let release!: () => void;
    const persisted = new Promise<void>((resolve) => { release = resolve; });
    const closing = active.close(() => persisted);
    let nextOpened = false;
    const next = gate.beforeOpen("session-1").then(() => { nextOpened = true; });

    await Promise.resolve();
    expect(nextOpened).toBe(false);
    release();
    await closing;
    await next;
    expect(nextOpened).toBe(true);
  });

  it("single-flights terminal callbacks and never opens through a failed closure", async () => {
    const gate = createSessionTurnClosureGate();
    const active = gate.open("session-1");
    const write = vi.fn(async () => { throw new Error("turn/end was not durable"); });

    await expect(active.close(write)).rejects.toThrow("turn/end was not durable");
    await expect(active.close(write)).rejects.toThrow("turn/end was not durable");
    expect(write).toHaveBeenCalledOnce();
    await expect(gate.beforeOpen("session-1")).rejects.toThrow("turn/end was not durable");
  });

  it("lets Stop durably close a turn when no stream terminal callback arrives", async () => {
    const gate = createSessionTurnClosureGate();
    const persistAbort = vi.fn(async () => {});
    const active = gate.open("session-1", persistAbort);

    await gate.stop("session-1");
    await active.close(async () => {
      throw new Error("the late stream callback must not write twice");
    });
    await expect(gate.beforeOpen("session-1")).resolves.toBeUndefined();
    expect(persistAbort).toHaveBeenCalledOnce();
  });

  it("does not start the next provider step before the prior stream step is durably observed", async () => {
    const gate = createSessionStepPersistenceGate();
    let transitioned = false;
    const transition = gate.beforeStep(1).then(() => {
      transitioned = true;
    });

    gate.partPersisted({ type: "tool-result" });
    await Promise.resolve();
    expect(transitioned).toBe(false);

    gate.partPersisted({ type: "finish-step" });
    await transition;
    expect(transitioned).toBe(true);
  });

  it("adapts every profile-selected tool contribution inside the session plugin", () => {
    const execute = vi.fn();
    const build = vi.fn((_runtime: AiToolRuntime) => ({
      inspect_workspace: {
        description: "Inspect the selected workspace",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute,
      },
    }));
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [{ id: "workspace", group: "files", build } satisfies AiToolContribution],
      toolExecution: toolExecutor(),
      workspaceRigs,
    });
    const runtime = { getSessionId: () => "session-1" };
    const tools = buildSessionTools(runtime);
    expect(build).toHaveBeenCalledWith(runtime);
    expect(tools).toHaveProperty("inspect_workspace");
  });

  it("returns a normalized tool failure to the model instead of failing the provider stream", () => {
    const error = {
      name: "Error",
      code: "TOOL_THREW",
      message: "invalid plugin variant",
    };

    expect(modelValueForSessionToolResult({
      ok: false,
      error,
      canonicalOutput: { ok: false, error },
      modelContent: { type: "json", value: { ok: false, error } },
    })).toEqual({ ok: false, error });
  });

  it("inspects and invokes the same selected definitions through the E2E seam", async () => {
    const execution = toolExecutor();
    vi.mocked(execution.executeStandalone).mockImplementation(async (input) => ({
      sessionId: "e2e-session" as never,
      ok: true,
      output: { input: input.input },
      canonicalOutput: { input: input.input } as never,
      modelContent: { type: "json", value: { input: input.input } } as never,
    }));
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [
        {
          id: "probe",
          group: "core",
          build: () => ({
            e2e_probe: {
              description: "Selected tool contribution",
              inputSchema: { type: "object", properties: {} },
              execute: async (input) => ({ input }),
            },
          }),
        },
      ],
      toolExecution: execution,
      workspaceRigs,
    });

    expect(inspectE2EToolDefinitions()).toEqual({
      e2e_probe: { description: "Selected tool contribution" },
    });
    await expect(invokeE2ETool("e2e_probe", { ok: true })).resolves.toEqual({
      input: { ok: true },
    });
    expect(execution.executeStandalone).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: "e2e-tool",
        name: "e2e_probe",
        input: { ok: true },
        authorize: expect.any(Function),
      }),
    );
  });

  it("keeps the complete authorized registry independent of disclosure hints", () => {
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [
        {
          id: "core",
          group: "core",
          build: () => ({ core_tool: definition("Core") }),
        },
        {
          id: "files",
          group: "files",
          build: () => ({ file_tool: definition("Files") }),
        },
        {
          id: "ui",
          group: "ui",
          build: () => ({ ui_tool: definition("UI") }),
        },
      ],
      toolExecution: toolExecutor(),
      workspaceRigs,
    });

    expect(
      Object.keys(
        buildSessionToolDefinitions({ getSessionId: () => "session-1" }),
      ),
    ).toEqual(["core_tool", "file_tool", "ui_tool"]);
  });

  it("derives the active skill scope from actual tool results", () => {
    expect(activeSkillFromSteps([
      {
        toolResults: [{
          toolName: "skill",
          output: { ok: true, skill: "Review", allowedGroups: ["files", "git"] },
        }],
      },
    ])).toEqual({ allowedGroups: ["files", "git"] });
    expect(activeSkillFromSteps([
      {
        toolResults: [{
          toolName: "skill",
          output: { ok: true, skill: "Review", allowedGroups: ["files"] },
        }],
      },
      {
        toolResults: [{ toolName: "skill", output: { ok: true, deactivated: true } }],
      },
    ])).toBeNull();
  });

  it("maps provider stream parts to current-format session diagnostics", () => {
    expect(
      sessionDiagnosticForStreamPart({ type: "text-delta", id: "t1", text: "hi" }),
    ).toEqual({
      kind: "stream-text-delta",
      payload: { id: "t1", delta: "hi" },
    });
    expect(
      sessionDiagnosticForStreamPart({
        type: "reasoning-delta",
        id: "r1",
        text: "think",
      }),
    ).toMatchObject({ kind: "stream-reasoning-delta" });
    expect(
      sessionDiagnosticForStreamPart({
        type: "tool-call",
        toolName: "read_file",
        toolCallId: "call-1",
        input: { path: "a" },
      }),
    ).toMatchObject({ kind: "stream-tool-call" });
    expect(
      sessionDiagnosticForStreamPart({
        type: "tool-result",
        toolName: "read_file",
        toolCallId: "call-1",
        output: "contents",
      }),
    ).toMatchObject({ kind: "stream-tool-result" });
    expect(
      sessionDiagnosticForStreamPart({ type: "finish", finishReason: "stop" }),
    ).toEqual({
      kind: "stream-finish",
      payload: { finishReason: "stop" },
    });
  });

  it("describes effective tools with current schema and contributor provenance", () => {
    const tools = {
      read_file: definition("Read a file"),
    };

    expect(
      describeSessionTools(tools, new Map([
        ["read_file", { pluginId: "ai-tools-files-native", contributionId: "files" }],
      ])),
    ).toEqual([{
      name: "read_file",
      description: "Read a file",
      schema: tools.read_file.inputSchema,
      contributor: {
        pluginId: "ai-tools-files-native",
        contributionId: "files",
      },
    }]);
  });

  it("routes call and approval stream parts through the single execution authority", async () => {
    const execution = toolExecutor();
    const readFile = {
      ...definition("Read a file"),
      needsApproval: true,
    };
    const recorder = createSessionStreamRecorder({
      turn: TurnId(2),
      step: StepId(3),
      requestId: RequestId("request-1"),
    }, {
      sessionId: "session-1",
      definitions: { read_file: readFile },
      execution,
      contributors: new Map([
        ["read_file", { pluginId: "ai-tools-files-native", contributionId: "files" }],
      ]),
      approvalPolicy: { mode: "ask" },
    });

    await expect(recorder.record({
      type: "tool-call",
      toolName: "read_file",
      toolCallId: "call-1",
      input: { path: "a.ts" },
    })).resolves.toEqual([]);
    expect(execution.recordCall).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      turn: 2,
      step: 3,
      requestId: "request-1",
      callId: "call-1",
      name: "read_file",
      input: { path: "a.ts" },
      contributor: {
        pluginId: "ai-tools-files-native",
        contributionId: "files",
      },
    }));
    await expect(recorder.record({
      type: "tool-approval-request",
      approvalId: "approval-1",
      toolCall: {
        toolName: "read_file",
        toolCallId: "call-1",
        input: { path: "a.ts" },
      },
      isAutomatic: false,
    })).resolves.toEqual([]);
    expect(execution.recordApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        resolution: expect.objectContaining({ action: "ask" }),
      }),
    );
    await expect(recorder.record({
      type: "tool-approval-response",
      approvalId: "approval-1",
      toolCall: {
        toolName: "read_file",
        toolCallId: "call-1",
        input: { path: "a.ts" },
      },
      approved: true,
    })).resolves.toEqual([]);
    expect(execution.recordApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        outcome: "allowed-once",
        responder: "user",
      }),
    );
    await expect(recorder.record({
      type: "tool-result",
      toolName: "read_file",
      toolCallId: "call-1",
      output: { content: "file" },
    })).resolves.toEqual([]);
    expect(execution.complete).not.toHaveBeenCalled();
    expect(recorder.waiting()).toBeNull();
  });

  it("classifies an interactive tool call as human input that suspends the turn", async () => {
    const execution = toolExecutor();
    const recorder = createSessionStreamRecorder({
      turn: TurnId(2),
      step: StepId(3),
      requestId: RequestId("request-1"),
    }, {
      sessionId: "session-1",
      definitions: {
        ask_ui: {
          description: "Wait for a user choice",
          inputSchema: { type: "object", properties: {} },
        },
      },
      execution,
      contributors: new Map([
        ["ask_ui", { pluginId: "ai-tools-ui-native", contributionId: "ui" }],
      ]),
      approvalPolicy: { mode: "ask" },
    });

    await expect(recorder.record({
      type: "tool-call",
      toolName: "ask_ui",
      toolCallId: "call-1",
      input: { question: "redacted" },
    })).resolves.toEqual([]);
    expect(recorder.waiting()).toEqual({
      callIds: ["call-1"],
      approvalIds: [],
    });
  });

  it("terminalizes every waiting call before a provider failure closes the turn", async () => {
    const execution = toolExecutor();
    const recorder = createSessionStreamRecorder({
      turn: TurnId(2),
      step: StepId(3),
      requestId: RequestId("request-1"),
    }, {
      sessionId: "session-1",
      definitions: {
        read_file: definition("Read a file"),
      },
      execution,
      contributors: new Map([
        ["read_file", { pluginId: "ai-tools-files-native", contributionId: "files" }],
      ]),
      approvalPolicy: { mode: "ask" },
    });
    await recorder.record({
      type: "tool-call",
      toolName: "read_file",
      toolCallId: "call-1",
      input: { path: "a.ts" },
    });
    await recorder.record({
      type: "tool-approval-request",
      approvalId: "approval-1",
      toolCall: {
        toolName: "read_file",
        toolCallId: "call-1",
        input: { path: "a.ts" },
      },
      isAutomatic: false,
    });

    await recorder.terminateWaiting({
      name: "ProviderError",
      code: "PROVIDER_FAILED",
      message: "connection closed",
    }, "unavailable");

    expect(execution.recordApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        outcome: "unavailable",
        responder: "parent",
      }),
    );
    expect(execution.complete).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-1",
      requestId: "request-1",
      error: expect.objectContaining({ code: "PROVIDER_FAILED" }),
    }));
    expect(recorder.waiting()).toBeNull();
  });

  it("records an SDK tool-error as the canonical result for its call", async () => {
    const execution = toolExecutor();
    const recorder = createSessionStreamRecorder({
      turn: TurnId(2),
      step: StepId(3),
      requestId: RequestId("resume-request"),
    }, {
      sessionId: "session-1",
      definitions: { write_file: definition("Write a file") },
      execution,
      contributors: new Map([
        ["write_file", { pluginId: "ai-tools-files-native", contributionId: "files" }],
      ]),
      approvalPolicy: { mode: "ask" },
      initialCalls: [{
        sessionId: SessionId("session-1"),
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-1"),
        callId: ToolCallId("call-1"),
        name: "write_file",
        input: { path: "a.ts", content: "x" },
        contributor: { pluginId: "ai-tools-files-native", contributionId: "files" },
      }],
    });

    await recorder.record({
      type: "tool-error",
      toolName: "write_file",
      toolCallId: "call-1",
      error: Object.assign(new Error("write failed"), { code: "WRITE_FAILED" }),
    });

    expect(execution.complete).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-1",
      requestId: "request-1",
      error: {
        name: "Error",
        code: "WRITE_FAILED",
        message: "write failed",
      },
    }));
  });

  it("persists an interactive answer before publishing it to the live chat", async () => {
    let release!: () => void;
    const durable = new Promise<void>((resolve) => { release = resolve; });
    const execution = toolExecutor();
    vi.mocked(execution.complete).mockImplementation(async () => {
      await durable;
      return {
        ok: true as const,
        output: { actionId: "yes" },
        canonicalOutput: { actionId: "yes" },
        modelContent: { type: "json", value: { actionId: "yes" } },
      };
    });
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: suspendedHistory() as unknown as SessionHistoryCapability,
      models: [],
    });
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [{
        id: "ui",
        group: "ui",
        build: () => ({
          ask_ui: {
            description: "Wait for a user choice",
            inputSchema: { type: "object", properties: {} },
          },
        }),
      }],
      toolExecution: execution,
      workspaceRigs,
    });
    const publish = vi.fn(async () => {});

    const responding = respondToOwnedInteractiveTool({
      sessionId: "session-1",
      toolName: "ask_ui",
      toolCallId: "call-1",
      output: { actionId: "yes" },
    }, publish);
    await vi.waitFor(() => expect(execution.complete).toHaveBeenCalledOnce());
    expect(publish).not.toHaveBeenCalled();
    release();
    await responding;
    expect(publish).toHaveBeenCalledOnce();
  });

  it.each([
    { approved: true, outcome: "allowed-once" },
    { approved: false, outcome: "rejected" },
  ] as const)("persists a manual approval decision before publishing approved=$approved", async ({ approved, outcome }) => {
    let release!: () => void;
    const durable = new Promise<void>((resolve) => { release = resolve; });
    const execution = toolExecutor();
    vi.mocked(execution.recordApprovalDecision).mockImplementation(async () => durable);
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: suspendedApprovalHistory() as unknown as SessionHistoryCapability,
      models: [],
    });
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [{
        id: "files",
        group: "files",
        build: () => ({
          read_file: definition("Read a file"),
        }),
      }],
      toolExecution: execution,
      workspaceRigs,
    });
    const publish = vi.fn(async () => {});

    const responding = respondToOwnedApproval({
      sessionId: "session-1",
      approvalId: "approval-1",
      approved,
    }, publish);
    await vi.waitFor(() => expect(execution.recordApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: "approval-1",
        outcome,
        responder: "user",
      }),
    ));
    expect(publish).not.toHaveBeenCalled();
    release();
    await responding;
    // A durable suspension can outlive the provider stream which originally
    // emitted the call. The approval owner must therefore settle the call
    // before publishing the response; the central executor single-flights a
    // later SDK replay of the same canonical call identity.
    if (approved) {
      expect(execution.complete).not.toHaveBeenCalled();
      expect(execution.execute).toHaveBeenCalledWith(expect.objectContaining({
        callId: "call-1",
        name: "read_file",
      }));
    } else {
      expect(execution.execute).not.toHaveBeenCalled();
      expect(execution.complete).toHaveBeenCalledWith(expect.objectContaining({
        callId: "call-1",
        error: expect.objectContaining({ code: "TOOL_DENIED" }),
      }));
    }
    expect(publish).toHaveBeenCalledOnce();
  });

  it("Stop cancels a durably suspended interaction and closes its turn", async () => {
    const append = vi.fn(async (
      _sessionId: unknown,
      _events: readonly unknown[],
    ) => undefined as never);
    const execution = toolExecutor();
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: {
        ...suspendedHistory(),
        append,
      } as unknown as SessionHistoryCapability,
      models: [],
    });
    configureChatRuntime({
      inference: {} as AiInferenceCapability,
      tools: [{
        id: "ui",
        group: "ui",
        build: () => ({
          ask_ui: {
            description: "Wait for a user choice",
            inputSchema: { type: "object", properties: {} },
          },
        }),
      }],
      toolExecution: execution,
      workspaceRigs,
    });

    const chat = {
      stop: vi.fn(async () => {}),
      messages: [{
        id: "assistant-1",
        role: "assistant",
        parts: [{
          type: "tool-ask_ui",
          toolCallId: "call-1",
          state: "input-available",
          input: { question: "redacted" },
        }],
      }],
    };

    await stopOwnedChat("session-1", chat as never);

    expect(execution.complete).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-1",
      error: expect.objectContaining({ code: "USER_CANCELLED" }),
    }));
    expect(append).toHaveBeenCalledWith(SessionId("session-1"), [
      expect.objectContaining({
        type: "turn/resume",
        data: { turn: TurnId(2), step: StepId(3), cause: "cancel" },
      }),
      expect.objectContaining({ type: "step/end" }),
      expect.objectContaining({ type: "turn/end" }),
    ], { durability: "written" });
    expect(vi.mocked(execution.complete).mock.invocationCallOrder[0]).toBeLessThan(
      append.mock.invocationCallOrder[0]!,
    );
    expect(chat.messages[0]?.parts[0]).toMatchObject({
      toolCallId: "call-1",
      state: "output-error",
      errorText: "Stopped by user",
    });
  });

  it("dispatches the provider abort before reading durable session history", async () => {
    let releaseRead!: () => void;
    const readStarted = new Promise<void>((resolve) => { releaseRead = resolve; });
    let finishRead!: () => void;
    const blockedRead = new Promise<void>((resolve) => { finishRead = resolve; });
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: {
        async readWindow() {
          releaseRead();
          await blockedRead;
          const window = await suspendedHistory().readWindow();
          return {
            ...window,
            events: [],
            loadedRange: null,
            repair: { state: "healthy" as const },
          };
        },
      } as unknown as SessionHistoryCapability,
      models: [],
    });
    const chat = {
      stop: vi.fn(async () => {}),
      messages: [],
    };

    const stopping = stopOwnedChat("session-1", chat as never);
    await readStarted;

    expect(chat.stop).toHaveBeenCalledOnce();
    finishRead();
    await stopping;
  });

  it("delivers streamed parts without waiting for diagnostic durability", async () => {
    let releaseAppend!: () => void;
    const appendBlocked = new Promise<void>((resolve) => { releaseAppend = resolve; });
    const append = vi.fn(async () => { await appendBlocked; });
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });
    const source = new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const reader = (recordedStream(
      "session-1",
      source,
      async () => [],
    ) as ReadableStream<unknown>).getReader();

    const first = reader.read();
    await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
    await expect(Promise.race([
      first,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("stream part waited for persistence")),
        25,
      )),
    ])).resolves.toEqual({
      done: false,
      value: { type: "finish", finishReason: "stop" },
    });

    releaseAppend();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("delivers a provider chunk before Trajectory maps or records it", async () => {
    let releaseMapping!: () => void;
    const mappingBlocked = new Promise<void>((resolve) => {
      releaseMapping = resolve;
    });
    const mapEvents = vi.fn(async () => {
      await mappingBlocked;
      return [];
    });
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: { append: vi.fn(async () => {}) } as unknown as SessionHistoryCapability,
      models: [],
    });
    const providerParts = [
      { type: "text-delta", id: "text-1", delta: "live" },
      { type: "text-delta", id: "text-1", delta: " now" },
    ];
    const source = new ReadableStream<unknown>({
      start(controller) {
        for (const part of providerParts) controller.enqueue(part);
        controller.close();
      },
    });
    const reader = (recordedStream(
      "session-1",
      source,
      mapEvents,
    ) as ReadableStream<unknown>).getReader();

    const first = reader.read();
    const second = reader.read();
    await vi.waitFor(() => expect(mapEvents).toHaveBeenCalledOnce());
    const winner = await Promise.race([
      Promise.all([first, second]).then(() => "chat" as const),
      new Promise<"trajectory">((resolve) => {
        setTimeout(() => resolve("trajectory"), 25);
      }),
    ]);
    releaseMapping();

    expect(winner).toBe("chat");
    await expect(first).resolves.toEqual({ done: false, value: providerParts[0] });
    await expect(second).resolves.toEqual({ done: false, value: providerParts[1] });
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("persists a burst of visible assistant chunks as one ordered batch", async () => {
    const append = vi.fn(async (
      _sessionId: unknown,
      _events: readonly unknown[],
    ) => undefined as never);
    configureSessionRuntime({
      preferences: {
        get: async () => undefined,
        getMany: async () => ({}),
        set: async () => {},
        delete: async () => false,
        subscribe: () => () => {},
      },
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });
    const source = new ReadableStream<{ index: number }>({
      start(controller) {
        for (let index = 0; index < 20; index += 1) controller.enqueue({ index });
        controller.close();
      },
    });
    const reader = (recordedStream(
      "session-1",
      source,
      async (part) => [{
        type: "assistant/chunk",
        time: Date.now(),
        data: {
          turn: TurnId(1),
          step: StepId(1),
          requestId: RequestId("request-1"),
          chunk: { kind: "text-delta", delta: String((part as { index: number }).index) },
        },
      }],
    ) as ReadableStream<{ index: number }>).getReader();

    const visible: number[] = [];
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      visible.push(item.value.index);
    }

    expect(visible).toEqual(Array.from({ length: 20 }, (_, index) => index));
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0]?.[1]).toHaveLength(20);
  });
});

function suspendedHistory() {
  return {
    async readWindow() {
      return {
        header: {
          formatVersion: SESSION_FORMAT_VERSION,
          id: SessionId("session-1"),
          createdAt: 1,
          authority: "v2" as const,
          backend: "chat",
          fidelity: "full" as const,
        },
        events: [
          {
            type: "tool/call" as const,
            seq: SessionSeq(0),
            time: 1,
            data: {
              turn: TurnId(2),
              step: StepId(3),
              requestId: RequestId("request-1"),
              callId: ToolCallId("call-1"),
              name: "ask_ui",
              rawArguments: "{}",
              parsedInput: { question: "redacted" },
              contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
              concurrency: "exclusive" as const,
            },
          },
          {
            type: "turn/suspend" as const,
            seq: SessionSeq(1),
            time: 2,
            data: {
              turn: TurnId(2),
              step: StepId(3),
              reason: "human-input" as const,
              callIds: [ToolCallId("call-1")],
              approvalIds: [],
            },
          },
        ],
        revision: SessionRevision(1),
        loadedRange: { start: 0, end: 1 },
        availability: { earlier: false, later: false },
        fidelity: "full" as const,
        repair: { state: "waiting-input" as const },
      };
    },
  };
}

function suspendedApprovalHistory() {
  return {
    async readWindow() {
      return {
        header: {
          formatVersion: SESSION_FORMAT_VERSION,
          id: SessionId("session-1"),
          createdAt: 1,
          authority: "v2" as const,
          backend: "chat",
          fidelity: "full" as const,
        },
        events: [
          {
            type: "tool/call" as const,
            seq: SessionSeq(0),
            time: 1,
            data: {
              turn: TurnId(2),
              step: StepId(3),
              requestId: RequestId("request-1"),
              callId: ToolCallId("call-1"),
              name: "read_file",
              rawArguments: "{\"path\":\"a.ts\"}",
              parsedInput: { path: "a.ts" },
              contributor: { pluginId: "ai-tools-files-native", contributionId: "files" },
              concurrency: "safe" as const,
            },
          },
          {
            type: "approval/request" as const,
            seq: SessionSeq(1),
            time: 2,
            data: {
              approvalId: "approval-1" as never,
              callId: ToolCallId("call-1"),
              policy: { mode: "ask" as const },
              reason: { kind: "tool-policy" as const },
            },
          },
          {
            type: "turn/suspend" as const,
            seq: SessionSeq(2),
            time: 3,
            data: {
              turn: TurnId(2),
              step: StepId(3),
              reason: "human-input" as const,
              callIds: [ToolCallId("call-1")],
              approvalIds: ["approval-1" as never],
            },
          },
        ],
        revision: SessionRevision(1),
        loadedRange: { start: 0, end: 2 },
        availability: { earlier: false, later: false },
        fidelity: "full" as const,
        repair: { state: "waiting-input" as const },
      };
    },
  };
}

function definition(description: string) {
  return {
    description,
    inputSchema: { type: "object", properties: {} },
    execute: () => null,
  };
}
