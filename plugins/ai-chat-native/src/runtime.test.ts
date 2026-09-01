import { describe, expect, it, vi } from "vitest";
import type { PreferencesCapability } from "@termco/storage-base";
import type {
  AppendSessionEvent,
  SessionHistoryCapability,
} from "@termco/session-base";
import {
  SESSION_FORMAT_VERSION,
  RequestId,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
} from "@termco/session-base";
import {
  abortChatTurn,
  appendSessionEvents,
  availableModelProviders,
  availableModels,
  beginNextChatStep,
  beginOwnedChatRequest,
  beginResumedChatTurn,
  configureSessionRuntime,
  completeChatTurn,
  customEndpointModel,
  deleteSessionDataValue,
  ensureOwnedSession,
  estimateModelCost,
  failChatTurn,
  listOwnedSessions,
  modelContextLimit,
  planOwnedCompaction,
  prepareOwnedSessionForContinuation,
  readLatestCompletedToolCall,
  readOwnedSuspension,
  providerModelIdForSelection,
  providerRequiresKey,
  resolveAvailableModel,
  saveSessionState,
  settleChatProviderEnd,
} from "./runtime";

it("reads the latest durable completion for one tool", async () => {
  const events = [
    {
      type: "tool/call",
      seq: 0,
      time: 1,
      data: {
        callId: "brief-1",
        name: "plugin_brief",
        parsedInput: { revision: 1 },
      },
    },
    {
      type: "tool/result",
      seq: 1,
      time: 2,
      data: { callId: "brief-1", canonicalOutput: { action: "confirm" } },
    },
    {
      type: "tool/call",
      seq: 2,
      time: 3,
      data: {
        callId: "brief-2",
        name: "plugin_brief",
        parsedInput: { revision: 2 },
      },
    },
    {
      type: "tool/result",
      seq: 3,
      time: 4,
      data: { callId: "brief-2", canonicalOutput: { action: "revise" } },
    },
  ];
  configureSessionRuntime({
    preferences: preferenceMemory().capability,
    history: {
      readWindow: vi.fn(async () => ({
        header: { id: "session-a" },
        events,
        revision: 1,
        availability: { earlier: false, later: false },
      })),
    } as unknown as SessionHistoryCapability,
    models: [],
  });

  await expect(
    readLatestCompletedToolCall("session-a", "plugin_brief"),
  ).resolves.toEqual({
    callId: "brief-2",
    input: { revision: 2 },
    output: { action: "revise" },
  });
});

function preferenceMemory(): {
  capability: PreferencesCapability;
  read: () => Record<string, unknown>;
} {
  let values: Record<string, unknown> = {};
  return {
    capability: {
      async get<T>(key: string): Promise<T | undefined> {
        await Promise.resolve();
        return values[key] as T | undefined;
      },
      async getMany(keys: string[]): Promise<Record<string, unknown>> {
        return Object.fromEntries(
          keys
            .filter((key) => key in values)
            .map((key) => [key, values[key]]),
        );
      },
      async set(key: string, value: unknown): Promise<void> {
        await Promise.resolve();
        values = { ...values, [key]: value };
      },
      async delete(key: string): Promise<boolean> {
        const existed = key in values;
        const next = { ...values };
        delete next[key];
        values = next;
        return existed;
      },
      subscribe: () => () => {},
    },
    read: () => values,
  };
}

describe("AI session persistence", () => {
  it("plans compaction only after pending canonical writes are committed", async () => {
    const memory = preferenceMemory();
    let releaseAppend = () => {};
    let committed = false;
    const appendGate = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    const append = vi.fn(async () => {
      await appendGate;
      committed = true;
      return undefined as never;
    });
    const readWindow = vi.fn(async () => ({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("session-a"),
        createdAt: 1,
        authority: "v2" as const,
        backend: "chat",
        fidelity: "full" as const,
      },
      events: [
        {
          type: "user/message" as const,
          seq: SessionSeq(0),
          time: 1,
          data: {
            turn: TurnId(1),
            message: { id: "user-a", role: "user", parts: [] },
            source: "human" as const,
          },
          surfaceOp: { op: "append" as const },
        },
        {
          type: "assistant/message" as const,
          seq: SessionSeq(1),
          time: 2,
          data: {
            turn: TurnId(1),
            step: StepId(1),
            requestId: RequestId("request-a"),
            message: { id: "assistant-a", role: "assistant", parts: [] },
            finishReason: "stop",
          },
          surfaceOp: { op: "append" as const },
        },
      ],
      revision: SessionRevision(1),
      loadedRange: { start: 0, end: 1 },
      availability: { earlier: false, later: false },
      fidelity: "full" as const,
      repair: { state: "healthy" as const },
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append, readWindow } as unknown as SessionHistoryCapability,
      models: [],
    });

    const pendingWrite = appendSessionEvents("session-a", [{
      type: "adapter/event",
      time: 3,
      data: { adapter: "test", kind: "pending", payload: null },
    }]);
    await vi.waitFor(() => expect(append).toHaveBeenCalledOnce());
    const planning = planOwnedCompaction("session-a", "assistant-a");
    await Promise.resolve();
    const readsBeforeCommit = readWindow.mock.calls.length;
    releaseAppend();
    await pendingWrite;
    await planning;

    expect(committed).toBe(true);
    expect(readsBeforeCommit).toBe(0);
  });

  it("creates a fresh canonical session from the structured missing-session contract", async () => {
    const memory = preferenceMemory();
    const create = vi.fn(async () => undefined as never);
    const inspect = vi.fn(async () => {
      throw Object.assign(new Error("session fresh-session does not exist"), {
        code: "SESSION_NOT_FOUND",
      });
    });
    configureSessionRuntime({
      preferences: memory.capability,
      history: {
        inspect,
        create,
      } as unknown as SessionHistoryCapability,
      models: [],
    });

    await ensureOwnedSession("fresh-session", {
      title: "New chat",
      rigId: "rig-a",
      createdAt: 123,
    });

    expect(create).toHaveBeenCalledWith({
      header: {
        formatVersion: 2,
        id: SessionId("fresh-session"),
        createdAt: 123,
        authority: "v2",
        backend: "chat",
        fidelity: "full",
        rigId: "rig-a",
      },
      seed: [{
        type: "session/title",
        time: 123,
        data: { title: "New chat", source: "system" },
      }],
      durability: "written",
    });
    expect(inspect).toHaveBeenCalledWith(SessionId("fresh-session"));
  });

  it("asks the canonical owner to repair an interrupted tail before continuation", async () => {
    const memory = preferenceMemory();
    const loadForContinuation = vi.fn(async () => undefined as never);
    configureSessionRuntime({
      preferences: memory.capability,
      history: { loadForContinuation } as unknown as SessionHistoryCapability,
      models: [],
    });

    await prepareOwnedSessionForContinuation("interrupted-session");

    expect(loadForContinuation).toHaveBeenCalledOnce();
    expect(loadForContinuation).toHaveBeenCalledWith(
      SessionId("interrupted-session"),
    );
  });

  it("discovers chat sessions only through the canonical owner", async () => {
    const memory = preferenceMemory();
    const list = vi.fn(async () => ({
      sessions: [{
        sessionId: SessionId("session-a"),
        createdAt: 1,
        updatedAt: 2,
        rigId: "rig-a",
        backend: "chat",
        fidelity: "full" as const,
        revision: 1,
        title: "Canonical",
        health: "healthy" as const,
      }, {
        sessionId: SessionId("coding-a"),
        createdAt: 1,
        updatedAt: 3,
        rigId: "rig-a",
        backend: "coding-agent",
        fidelity: "adapter" as const,
        revision: 1,
        title: "Coding",
        health: "healthy" as const,
      }],
      exhausted: true,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { list } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(listOwnedSessions()).resolves.toEqual([{
      id: "session-a",
      title: "Canonical",
      rigId: "rig-a",
      createdAt: 1,
      updatedAt: 2,
    }]);
    expect(list).toHaveBeenCalledWith({ limit: 100 });
  });

  it("records the exact effective request for every provider step", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: 10,
      lastSeq: 14,
      revision: 3,
      durability: "written" as const,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    const next = await beginNextChatStep({
      sessionId: "session-a",
      previous: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      selectedModelId: "selected-model",
      providerRoute: "openai-compatible",
      providerModelId: "wire-model",
      contextWindow: 1_000_000,
      maxOutputTokens: 32_000,
      reasoningEffort: "high",
      instructions: "effective system prompt",
      messages: [{ role: "user", content: "effective message" }],
      tools: [{
        name: "read_file",
        description: "Read a file",
        schema: { type: "object" },
        contributor: { pluginId: "files", contributionId: "read" },
      }],
      activeTools: ["read_file"],
      approvalPolicy: { mode: "ask" },
    });

    expect(next).toMatchObject({ turn: TurnId(2), step: StepId(4) });
    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      expect.objectContaining({
        type: "step/end",
        data: { turn: TurnId(2), step: StepId(3), reason: "completed" },
      }),
      expect.objectContaining({
        type: "step/start",
        data: { turn: TurnId(2), step: StepId(4) },
      }),
      expect.objectContaining({
        type: "request/header",
        data: expect.objectContaining({
          turn: TurnId(2),
          step: StepId(4),
          reason: "step",
          header: expect.objectContaining({
            selectedModelId: "selected-model",
            providerModelId: "wire-model",
            maxOutputTokens: 32_000,
            systemPrompt: "effective system prompt",
            messages: [{ role: "user", content: "effective message" }],
            activeTools: ["read_file"],
            approvalPolicy: { mode: "ask" },
          }),
        }),
      }),
      expect.objectContaining({
        type: "request/context",
        data: expect.objectContaining({
          contextWindow: 1_000_000,
          maxOutputTokens: 32_000,
        }),
      }),
      expect.objectContaining({ type: "request/attempt" }),
    ], { durability: "written" });
  });

  it("resumes a suspended turn with a new request without opening a new turn", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: SessionSeq(20),
      lastSeq: SessionSeq(23),
      revision: SessionRevision(4),
      durability: "written" as const,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    const resumed = await beginResumedChatTurn({
      sessionId: "session-a",
      suspended: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      selectedModelId: "selected-model",
      providerRoute: "openai-compatible",
      providerModelId: "wire-model",
      instructions: "effective system prompt",
      messages: [{ role: "tool", content: "user choice" }],
      tools: [],
      activeTools: ["ask_ui"],
      approvalPolicy: { mode: "ask" },
    });

    expect(resumed).toMatchObject({ turn: TurnId(2), step: StepId(3) });
    expect(resumed.requestId).not.toBe(RequestId("request-a"));
    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      {
        type: "turn/resume",
        time: expect.any(Number),
        data: { turn: TurnId(2), step: StepId(3), cause: "response" },
      },
      expect.objectContaining({
        type: "request/header",
        data: expect.objectContaining({
          turn: TurnId(2),
          step: StepId(3),
          reason: "resume",
        }),
      }),
      expect.objectContaining({ type: "request/context" }),
      expect.objectContaining({ type: "request/attempt" }),
    ], { durability: "written" });
  });

  it("records an aborted turn as aborted instead of completed", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: 10,
      lastSeq: 12,
      revision: 3,
      durability: "written" as const,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await completeChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      responseMessage: { id: "assistant-a", role: "assistant", parts: [] },
      finishReason: "abort",
    });

    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      expect.objectContaining({
        type: "assistant/message",
        data: expect.objectContaining({ interrupted: true }),
      }),
      expect.objectContaining({
        type: "step/end",
        data: { turn: TurnId(2), step: StepId(3), reason: "aborted" },
      }),
      expect.objectContaining({
        type: "turn/end",
        data: {
          turn: TurnId(2),
          reason: { kind: "aborted", cause: { kind: "user" } },
        },
      }),
    ], { durability: "written" });
  });

  it.each(["tool-calls", "abort"])(
    "suspends an interactive turn before settling provider finish=%s",
    async (finishReason) => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: SessionSeq(10),
      lastSeq: SessionSeq(11),
      revision: SessionRevision(3),
      durability: "written" as const,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(settleChatProviderEnd({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      responseMessage: {
        id: "assistant-a",
        role: "assistant",
        parts: [{
          type: "tool-ask_ui",
          toolCallId: "call-a",
          state: "input-available",
          input: {},
        }],
      },
      finishReason,
      waiting: { callIds: ["call-a"], approvalIds: [] },
    })).resolves.toBe("suspended");

    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      expect.objectContaining({
        type: "assistant/message",
        data: expect.objectContaining({ finishReason }),
      }),
      {
        type: "turn/suspend",
        time: expect.any(Number),
        data: {
          turn: TurnId(2),
          step: StepId(3),
          reason: "human-input",
          callIds: ["call-a"],
          approvalIds: [],
        },
      },
    ], { durability: "written" });
  });

  it("reconstructs a suspended tool identity from canonical history", async () => {
    const memory = preferenceMemory();
    const append = vi.fn();
    const readWindow = vi.fn(async () => ({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("session-a"),
        createdAt: 1,
        authority: "v2" as const,
        backend: "chat",
        fidelity: "full" as const,
      },
      events: [
        {
          type: "request/header" as const,
          seq: SessionSeq(0),
          time: 1,
          data: {
            turn: TurnId(2),
            step: StepId(3),
            requestId: RequestId("request-a"),
            reason: "initial" as const,
            header: {},
          },
        },
        {
          type: "tool/call" as const,
          seq: SessionSeq(1),
          time: 2,
          data: {
            turn: TurnId(2),
            step: StepId(3),
            requestId: RequestId("request-a"),
            callId: ToolCallId("call-a"),
            name: "ask_ui",
            rawArguments: "{}",
            parsedInput: { question: "redacted" },
            contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
            concurrency: "exclusive" as const,
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
            callIds: [ToolCallId("call-a")],
            approvalIds: [],
          },
        },
      ],
      revision: SessionRevision(1),
      loadedRange: { start: 0, end: 2 },
      availability: { earlier: false, later: false },
      fidelity: "full" as const,
      repair: { state: "waiting-input" as const },
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { readWindow, append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(readOwnedSuspension("session-a")).resolves.toEqual({
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      callIds: [ToolCallId("call-a")],
      approvalIds: [],
      pendingCallIds: [ToolCallId("call-a")],
      pendingApprovalIds: [],
      unresolvedCallIds: [ToolCallId("call-a")],
      readyToResume: false,
      approvals: [],
      calls: [{
        sessionId: SessionId("session-a"),
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
        callId: ToolCallId("call-a"),
        name: "ask_ui",
        input: { question: "redacted" },
        contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
      }],
    });
    await expect(beginOwnedChatRequest({
      sessionId: "session-a",
      userMessage: { role: "user", parts: [{ type: "text", text: "new prompt" }] },
      selectedModelId: "selected-model",
      providerRoute: "openai-compatible",
      providerModelId: "wire-model",
      instructions: "effective system prompt",
      messages: [],
      tools: [],
      activeTools: ["ask_ui"],
      approvalPolicy: { mode: "ask" },
    })).rejects.toThrow("waiting for a response");
    expect(append).not.toHaveBeenCalled();
  });

  it("marks a suspended interactive turn ready only after its canonical result exists", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: SessionSeq(4),
      lastSeq: SessionSeq(7),
      revision: SessionRevision(3),
      durability: "written" as const,
    }));
    const readWindow = vi.fn(async () => ({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("session-a"),
        createdAt: 1,
        authority: "v2" as const,
        backend: "chat",
        fidelity: "full" as const,
      },
      events: [
        {
          type: "request/header" as const,
          seq: SessionSeq(0),
          time: 1,
          data: {
            turn: TurnId(2),
            step: StepId(3),
            requestId: RequestId("request-a"),
            reason: "initial" as const,
            header: {},
          },
        },
        {
          type: "tool/call" as const,
          seq: SessionSeq(1),
          time: 2,
          data: {
            turn: TurnId(2),
            step: StepId(3),
            requestId: RequestId("request-a"),
            callId: ToolCallId("call-a"),
            name: "ask_ui",
            rawArguments: "{}",
            parsedInput: { question: "redacted" },
            contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
            concurrency: "exclusive" as const,
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
            callIds: [ToolCallId("call-a")],
            approvalIds: [],
          },
        },
        {
          type: "tool/result" as const,
          seq: SessionSeq(3),
          time: 4,
          data: {
            turn: TurnId(2),
            step: StepId(3),
            requestId: RequestId("request-a"),
            callId: ToolCallId("call-a"),
            status: "ok" as const,
            output: { choice: "confirmed" },
            contributor: { pluginId: "ai-tools-ui-native", contributionId: "ui" },
          },
        },
      ],
      revision: SessionRevision(2),
      loadedRange: { start: 0, end: 3 },
      availability: { earlier: false, later: false },
      fidelity: "full" as const,
      repair: { state: "waiting-input" as const },
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { readWindow, append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(readOwnedSuspension("session-a")).resolves.toMatchObject({
      pendingCallIds: [],
      pendingApprovalIds: [],
      unresolvedCallIds: [],
      readyToResume: true,
    });
    await expect(beginOwnedChatRequest({
      sessionId: "session-a",
      userMessage: { role: "user", parts: [] },
      selectedModelId: "selected-model",
      providerRoute: "openai-compatible",
      providerModelId: "wire-model",
      instructions: "effective system prompt",
      messages: [{ role: "tool", content: "answer" }],
      tools: [],
      activeTools: ["ask_ui"],
      approvalPolicy: { mode: "ask" },
    })).resolves.toMatchObject({ turn: TurnId(2), step: StepId(3) });
    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      expect.objectContaining({ type: "turn/resume" }),
      expect.objectContaining({ type: "request/header" }),
      expect.objectContaining({ type: "request/context" }),
      expect.objectContaining({ type: "request/attempt" }),
    ], { durability: "written" });
  });

  it("rejects a completed assistant message without a canonical identity", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => undefined as never);
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(completeChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      responseMessage: { id: "", role: "assistant", parts: [] },
      finishReason: "stop",
    })).rejects.toThrow("canonical message id");
    expect(append).not.toHaveBeenCalled();
  });

  it("treats a late terminal callback as settled after canonical recovery closed its handle", async () => {
    const memory = preferenceMemory();
    const appendFailure = Object.assign(
      new Error("seq 93 (step/end) violates step-balance: turn 1, step 2 is not open"),
      { code: "INVARIANT_VIOLATION" },
    );
    const append = vi.fn(async () => { throw appendFailure; });
    const readWindow = vi.fn(async () => ({
      header: {
        formatVersion: SESSION_FORMAT_VERSION,
        id: SessionId("session-a"),
        createdAt: 1,
        authority: "v2" as const,
        backend: "chat",
        fidelity: "full" as const,
      },
      events: [
        {
          type: "step/end" as const,
          seq: SessionSeq(0),
          time: 1,
          data: { turn: TurnId(1), step: StepId(2), reason: "interrupted" as const },
        },
        {
          type: "turn/end" as const,
          seq: SessionSeq(1),
          time: 2,
          data: { turn: TurnId(1), reason: { kind: "interrupted" as const } },
        },
      ],
      revision: SessionRevision(2),
      loadedRange: { start: 0, end: 1 },
      availability: { earlier: false, later: false },
      fidelity: "full" as const,
      repair: { state: "healthy" as const },
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append, readWindow } as unknown as SessionHistoryCapability,
      models: [],
    });

    await expect(completeChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(1),
        step: StepId(2),
        requestId: RequestId("late-request"),
      },
      responseMessage: { id: "assistant-late", role: "assistant", parts: [] },
      finishReason: "stop",
    })).resolves.toBeUndefined();
    expect(append).toHaveBeenCalledOnce();
    expect(readWindow).toHaveBeenCalledOnce();
  });

  it("closes the current request, step, and turn when the provider fails", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => ({
      sessionId: SessionId("session-a"),
      firstSeq: 10,
      lastSeq: 12,
      revision: 3,
      durability: "written" as const,
    }));
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await failChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      error: Object.assign(new Error("provider unavailable"), { code: "UPSTREAM_DOWN" }),
    });

    expect(append).toHaveBeenCalledWith(SessionId("session-a"), [
      {
        type: "request/failure",
        time: expect.any(Number),
        data: {
          requestId: RequestId("request-a"),
          attempt: 1,
          failure: { name: "Error", code: "UPSTREAM_DOWN", message: "provider unavailable" },
        },
      },
      {
        type: "step/end",
        time: expect.any(Number),
        data: { turn: TurnId(2), step: StepId(3), reason: "provider-error" },
      },
      {
        type: "turn/end",
        time: expect.any(Number),
        data: {
          turn: TurnId(2),
          reason: {
            kind: "provider-error",
            failure: { name: "Error", code: "UPSTREAM_DOWN", message: "provider unavailable" },
          },
        },
      },
    ], { durability: "written" });
  });

  it("records the actual exhausted provider attempt", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async () => undefined as never);
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await failChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
      attempt: 3,
      error: new Error("provider unavailable"),
    });

    expect(append).toHaveBeenCalledWith(SessionId("session-a"),
      expect.arrayContaining([
        expect.objectContaining({
          type: "request/failure",
          data: expect.objectContaining({ attempt: 3 }),
        }),
      ]),
      { durability: "written" },
    );
  });

  it("closes a cancelled pre-stream request without misreporting a provider failure", async () => {
    const memory = preferenceMemory();
    const append = vi.fn(async (
      _sessionId: ReturnType<typeof SessionId>,
      _events: readonly AppendSessionEvent[],
    ) => undefined as never);
    configureSessionRuntime({
      preferences: memory.capability,
      history: { append } as unknown as SessionHistoryCapability,
      models: [],
    });

    await abortChatTurn({
      sessionId: "session-a",
      handle: {
        turn: TurnId(2),
        step: StepId(3),
        requestId: RequestId("request-a"),
      },
    });

    const events = vi.mocked(append).mock.calls[0]?.[1] ?? [];
    expect(events.map((event) => event.type)).toEqual(["step/end", "turn/end"]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "step/end",
        data: { turn: TurnId(2), step: StepId(3), reason: "aborted" },
      }),
      expect.objectContaining({
        type: "turn/end",
        data: {
          turn: TurnId(2),
          reason: { kind: "aborted", cause: { kind: "user" } },
        },
      }),
    ]);
  });

  it("reads model policy only from the selected ai.models providers", () => {
    const memory = preferenceMemory();
    configureSessionRuntime({
      preferences: memory.capability,
      history: {} as SessionHistoryCapability,
      models: [
        {
          id: "openai",
          label: "Replacement OpenAI",
          keyringAccount: "replacement-key",
          keyPrefix: null,
          consoleUrl: "https://example.invalid",
          keyRequirement: "required",
          kind: "cloud",
          description: "Replacement provider",
          models: [
            {
              id: "replacement-model",
              provider: "openai",
              label: "Replacement Model",
              hint: "Selected",
              description: "Provided at runtime",
              capabilities: { intelligence: 5, speed: 4, cost: 3 },
              contextWindow: 64_000,
              pricing: { input: 1, output: 2 },
            },
          ],
        },
        {
          id: "openai-compatible",
          label: "Compatible",
          keyringAccount: "",
          keyPrefix: null,
          consoleUrl: "https://example.invalid",
          keyRequirement: "optional",
          kind: "compatible",
          description: "Custom endpoints",
          models: [],
          customEndpoint: {
            modelIdPrefix: "company-",
            keyringAccountPrefix: "company-",
            keyringAccountSuffix: "-key",
            modelIdFor: (id) => `company-${id}`,
            endpointIdFrom: (id) => id.startsWith("company-") ? id.slice(8) : null,
            modelFor: (endpoint) => ({
              id: `company-${endpoint.id}`,
              provider: "openai-compatible",
              label: endpoint.modelId,
              hint: endpoint.name,
              description: endpoint.baseURL,
              capabilities: { intelligence: 3, speed: 3, cost: 3 },
              contextWindow: endpoint.contextLimit,
            }),
          },
        },
      ],
    });

    expect(availableModelProviders()[0]?.label).toBe("Replacement OpenAI");
    expect(availableModels()).toHaveLength(1);
    expect(resolveAvailableModel("replacement-model")?.label).toBe(
      "Replacement Model",
    );
    expect(providerRequiresKey("openai")).toBe(true);
    expect(modelContextLimit("replacement-model")).toBe(64_000);
    expect(
      estimateModelCost("replacement-model", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedInputTokens: 0,
      }),
    ).toBe(3);
    const endpoint = {
      id: "local",
      name: "Local",
      baseURL: "http://127.0.0.1:8080/v1",
      modelId: "local-model",
      contextLimit: 32_000,
    };
    expect(customEndpointModel(endpoint)).toMatchObject({
      id: "company-local",
      contextWindow: 32_000,
    });
    expect(modelContextLimit("company-local", [endpoint])).toBe(32_000);
    expect(modelContextLimit("company-missing", [endpoint])).toBe(128_000);
    expect(providerModelIdForSelection("company-local", [endpoint])).toBe(
      "local-model",
    );
    expect(providerModelIdForSelection("replacement-model", [endpoint])).toBe(
      "replacement-model",
    );
  });

  it("serializes overlapping state writes so no session data is lost", async () => {
    const memory = preferenceMemory();
    configureSessionRuntime({
      preferences: memory.capability,
      history: {} as SessionHistoryCapability,
      models: [],
    });

    await Promise.all([
      saveSessionState("session-a", { title: "A" }),
      saveSessionState("session-b", { title: "B" }),
    ]);

    expect(memory.read()["ai.sessions.state"]).toEqual({
      "session-a": { title: "A" },
      "session-b": { title: "B" },
    });
  });

  it("orders deletion behind pending writes", async () => {
    const memory = preferenceMemory();
    configureSessionRuntime({
      preferences: memory.capability,
      history: {} as SessionHistoryCapability,
      models: [],
    });

    await Promise.all([
      saveSessionState("session-a", { title: "A" }),
      deleteSessionDataValue("session-a"),
    ]);

    expect(memory.read()["ai.sessions.state"]).toEqual({});
  });
});
