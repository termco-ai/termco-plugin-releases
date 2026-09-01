// @vitest-environment jsdom
import type { Chat, UIMessage } from "@ai-sdk/react";
import type { AiInferenceCapability } from "@termco/ai-inference-base";
import {
  SESSION_FORMAT_VERSION,
  CompactionId,
  RequestId,
  SessionId,
  SessionRevision,
  SessionSeq,
  StepId,
  TurnId,
  type ForkSessionInput,
  type AppendSessionEvent,
  type JsonObject,
  type SessionHistoryCapability,
  type SessionWindow,
} from "@termco/session-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureCompactionRuntime } from "../../runtime/compactionRuntime";
import { usePreferencesStore } from "../../runtime/preferences";
import { configureSessionRuntime } from "../../../runtime";
import { chats, seedMessages } from "../../../store/registry";
import { useChatStore } from "../../../store/store";
import {
  cancelCompaction,
  contextFillRatio,
  isCompacting,
  runCompaction,
  shouldCompactBeforeSend,
} from "./compaction";

function conversation(turns: number): UIMessage[] {
  return Array.from({ length: turns }, (_, index) => [
    {
      id: `u${index}`,
      role: "user" as const,
      parts: [
        { type: "text" as const, text: `question ${index} ${"detail ".repeat(1_000)}` },
      ],
    },
    {
      id: `a${index}`,
      role: "assistant" as const,
      parts: [
        { type: "text" as const, text: `answer ${index} ${"result ".repeat(1_000)}` },
      ],
    },
  ]).flat();
}

const generate = vi.fn<AiInferenceCapability["generate"]>();
let disposeRuntime = () => {};
let disposeSessions = () => {};
let forkHistory: ReturnType<typeof vi.fn>;
let appendHistory: ReturnType<typeof vi.fn>;
let sourceWindow: SessionWindow;

function sessionWindow(
  sessionId: string,
  title: string,
  messages: readonly UIMessage[],
): SessionWindow {
  return {
    header: {
      formatVersion: SESSION_FORMAT_VERSION,
      id: SessionId(sessionId),
      createdAt: 1,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
      rigId: "default",
    },
    events: [
      {
        type: "session/title",
        seq: SessionSeq(0),
        time: 1,
        data: { title, source: "user" },
      },
      ...messages.map((message, index) => {
        const turn = TurnId(Math.floor(index / 2) + 1);
        const seq = SessionSeq(index + 1);
        if (message.role === "user") {
          return {
            type: "user/message" as const,
            seq,
            time: index + 2,
            data: {
              turn,
              message: message as unknown as JsonObject,
              source: "human" as const,
            },
            surfaceOp: { op: "append" as const },
          };
        }
        return {
          type: "assistant/message" as const,
          seq,
          time: index + 2,
          data: {
            turn,
            step: StepId(Math.floor(index / 2) + 1),
            requestId: RequestId(`request-${index}`),
            message: message as unknown as JsonObject,
            finishReason: "stop",
          },
          surfaceOp: { op: "append" as const },
        };
      }),
    ],
    revision: SessionRevision(messages.length + 1),
    loadedRange: { start: 0, end: messages.length },
    availability: { earlier: false, later: false },
    fidelity: "full",
    repair: { state: "healthy" },
  };
}

function withPriorCompaction(window: SessionWindow): SessionWindow {
  const start = window.events.length;
  const compactionId = CompactionId("prior-compaction");
  return {
    ...window,
    events: [
      ...window.events,
      {
        type: "compaction/start",
        seq: SessionSeq(start),
        time: 100,
        data: {
          compactionId,
          trigger: "manual",
          measuredTokens: 50_000,
          candidate: { start: SessionSeq(1), end: SessionSeq(2) },
          policyRevision: "1",
        },
      },
      {
        type: "compaction/summary",
        seq: SessionSeq(start + 1),
        time: 101,
        data: {
          compactionId,
          request: { modelId: "summary-model", sourceSessionIds: ["s0"] },
          summary: { text: "FIRST" },
        },
      },
      {
        type: "compaction/message",
        seq: SessionSeq(start + 2),
        time: 102,
        data: {
          compactionId,
          content: { text: "FIRST", blocks: ["FIRST"] },
        },
        surfaceOp: {
          op: "replace",
          start: SessionSeq(1),
          end: SessionSeq(2),
        },
        sourceEventSeqs: [SessionSeq(1), SessionSeq(2)],
      },
      {
        type: "compaction/end",
        seq: SessionSeq(start + 3),
        time: 103,
        data: { compactionId, outcome: "succeeded" },
      },
    ],
    revision: SessionRevision(Number(window.revision) + 1),
    loadedRange: { start: 0, end: start + 3 },
  };
}

beforeEach(() => {
  chats.clear();
  seedMessages.clear();
  generate.mockReset();
  generate.mockResolvedValue({
    text: "<analysis>working</analysis><summary>THE SUMMARY</summary>",
    stepCount: 1,
    durationMs: 10,
  });
  disposeRuntime = configureCompactionRuntime({
    configuration: vi.fn(async () => ({
      configuredProviderIds: [],
      configuredCustomEndpointIds: [],
    })),
    generate,
    stream: vi.fn(),
  });
  useChatStore.setState({
    sessionsHydrated: true,
    sessions: [
      {
        id: "s1",
        title: "My chat",
        rigId: "default",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    activeSessionId: "s1",
    currentRigId: "default",
    activeByRig: { default: "s1" },
    agentMeta: {
      ...useChatStore.getState().agentMeta,
      lastInputTokens: 50_000,
      compacting: null,
    },
  });
  const messages = conversation(8);
  sourceWindow = sessionWindow("s1", "My chat", messages);
  chats.set(
    "s1",
    {
      messages,
      status: "ready",
      stop: vi.fn(),
    } as unknown as Chat<UIMessage>,
  );
  let child: SessionWindow | undefined;
  forkHistory = vi.fn(async (input: ForkSessionInput) => {
    const createdAt = Date.now();
    const nextSeq = sourceWindow.events.length;
    child = {
      ...sourceWindow,
      header: {
        ...sourceWindow.header,
        id: SessionId("compacted-session"),
        createdAt,
        parent: {
          sessionId: SessionId("s1"),
          boundarySeq: input.boundary.kind === "completed-turn"
            ? SessionSeq(0)
            : input.boundary.seq,
          seedLength: sourceWindow.events.length,
        },
        origin: input.origin ?? "fork",
      },
      events: [
        ...sourceWindow.events,
        {
          type: "session/end-seed",
          seq: SessionSeq(nextSeq),
          time: createdAt,
          data: {},
        },
        {
          type: "session/title",
          seq: SessionSeq(nextSeq + 1),
          time: createdAt,
          data: { title: input.title ?? "Compacted chat", source: "user" },
        },
      ],
      revision: SessionRevision(0),
      loadedRange: { start: 0, end: nextSeq + 1 },
    };
    return {
      childSessionId: child.header.id,
      parentSessionId: SessionId("s1"),
      boundary: {
        requested: input.boundary,
        resolvedSeq: input.boundary.kind === "completed-turn"
          ? SessionSeq(0)
          : input.boundary.seq,
        seedLength: child.events.length,
        structuralState: "balanced" as const,
      },
      revision: SessionRevision(0),
    };
  });
  appendHistory = vi.fn(async (
    sessionId: ReturnType<typeof SessionId>,
    events: readonly AppendSessionEvent[],
    options?: { durability?: "memory" | "written" | "flushed" },
  ) => {
    if (sessionId === sourceWindow.header.id) {
      const first = sourceWindow.events.length;
      const committed = events.map((event, index) => ({
        ...event,
        seq: SessionSeq(first + index),
      })) as SessionWindow["events"];
      sourceWindow = {
        ...sourceWindow,
        events: [...sourceWindow.events, ...committed],
        revision: SessionRevision(Number(sourceWindow.revision) + 1),
        loadedRange: { start: 0, end: first + committed.length - 1 },
      };
      return {
        sessionId,
        firstSeq: SessionSeq(first),
        lastSeq: SessionSeq(first + committed.length - 1),
        revision: sourceWindow.revision,
        durability: options?.durability ?? "memory",
      };
    }
    if (!child || sessionId !== child.header.id) {
      throw new Error(`unexpected append target ${sessionId}`);
    }
    const first = child.events.length;
    const committed = events.map((event, index) => ({
      ...event,
      seq: SessionSeq(first + index),
    })) as SessionWindow["events"];
    child = {
      ...child,
      events: [...child.events, ...committed],
      revision: SessionRevision(Number(child.revision) + 1),
      loadedRange: { start: 0, end: first + committed.length - 1 },
    };
    return {
      sessionId,
      firstSeq: SessionSeq(first),
      lastSeq: SessionSeq(first + committed.length - 1),
      revision: child.revision,
      durability: options?.durability ?? "memory",
    };
  });
  const history = {
    readWindow: vi.fn(async (sessionId: ReturnType<typeof SessionId>) =>
      sessionId === child?.header.id
        ? child
        : sourceWindow),
    fork: forkHistory,
    append: appendHistory,
  } as unknown as SessionHistoryCapability;
  disposeSessions = configureSessionRuntime({
    preferences: {
      get: vi.fn(async () => undefined),
      getMany: vi.fn(async () => ({})),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => false),
      subscribe: vi.fn(() => () => undefined),
    },
    history,
    models: [],
  });
});

afterEach(() => {
  disposeRuntime();
  disposeSessions();
  chats.clear();
  seedMessages.clear();
});

describe("runCompaction", () => {
  it("summarizes the old head and forks a new session without mutating the source", async () => {
    const source = [...(chats.get("s1")?.messages ?? [])];

    const result = await runCompaction({
      sessionId: "s1",
      mode: "manual",
      instructions: "keep migration details",
    });

    expect(result).toMatchObject({ ok: true });
    expect(forkHistory).toHaveBeenCalledWith({
      sessionId: SessionId("s1"),
      boundary: { kind: "event", seq: SessionSeq(16) },
      title: "↺ My chat",
      origin: "compaction",
    });
    expect(chats.get("s1")?.messages).toEqual(source);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: useChatStore.getState().selectedModelId,
        maxSteps: 1,
        abortSignal: expect.any(AbortSignal),
      }),
    );
    const nextId = result && "sessionId" in result ? result.sessionId : "";
    const successor = useChatStore
      .getState()
      .sessions.find((session) => session.id === nextId);
    expect(successor?.compaction).toMatchObject({
      blocks: ["THE SUMMARY"],
      sourceSessionId: "s1",
      trigger: "manual",
      round: 1,
    });
    const restored = seedMessages.get(nextId) ?? [];
    expect(restored.length).toBeLessThan(source.length);
    expect(restored.some((message) => message.id === "u0")).toBe(false);
    expect(restored.at(0)?.role).toBe("user");
    expect(appendHistory.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ type: "compaction/start" }),
    ]);
    expect(appendHistory.mock.calls[0]?.[2]).toEqual({ durability: "flushed" });
    const completedAppend = appendHistory.mock.calls.find((call) =>
      (call[1] as readonly AppendSessionEvent[]).some(
        (event) => event.type === "compaction/summary",
      )
    );
    expect(completedAppend?.[1]).toEqual([
      expect.objectContaining({ type: "compaction/summary" }),
      expect.objectContaining({
        type: "compaction/message",
        surfaceOp: expect.objectContaining({ op: "replace" }),
      }),
      expect.objectContaining({
        type: "compaction/end",
        data: expect.objectContaining({ outcome: "succeeded" }),
      }),
    ]);
  });

  it("leaves the source untouched when inference fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValueOnce(new Error("provider unavailable"));
    const source = [...(chats.get("s1")?.messages ?? [])];
    const result = await runCompaction({ sessionId: "s1", mode: "manual" });
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(errorLog).toHaveBeenCalledWith(
      "[compaction] the summariser call failed:",
      expect.objectContaining({ message: "provider unavailable" }),
    );
    expect(chats.get("s1")?.messages).toEqual(source);
    expect(useChatStore.getState().sessions).toHaveLength(1);
    expect(isCompacting("s1")).toBe(false);
    errorLog.mockRestore();
  });

  it("closes a canonical compaction attempt when inference is cancelled", async () => {
    generate.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          request.abortSignal?.addEventListener("abort", () =>
            resolve({
              text: "<summary>ignored</summary>",
              stepCount: 1,
              durationMs: 1,
            }),
          );
        }),
    );
    const pending = runCompaction({ sessionId: "s1", mode: "manual" });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    expect(isCompacting("s1")).toBe(true);
    cancelCompaction("s1");
    await expect(pending).resolves.toEqual({ ok: false, reason: "cancelled" });
    expect(useChatStore.getState().sessions).toHaveLength(1);
  });

  it("rejects a summary if the conversation changed during inference", async () => {
    generate.mockImplementationOnce(async () => {
      const current = chats.get("s1") as Chat<UIMessage>;
      current.messages = [...current.messages, ...conversation(1)];
      return {
        text: "<summary>stale</summary>",
        stepCount: 1,
        durationMs: 1,
      };
    });
    await expect(
      runCompaction({ sessionId: "s1", mode: "manual" }),
    ).resolves.toEqual({ ok: false, reason: "stale" });
    expect(useChatStore.getState().sessions).toHaveLength(1);
  });

  it("appends a later summary block and extends the transcript chain", async () => {
    sourceWindow = withPriorCompaction(sourceWindow);
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "↺ My chat",
          rigId: "default",
          createdAt: 1,
          updatedAt: 1,
          compaction: {
            blocks: ["FIRST"],
            transcriptIds: ["s0"],
            sourceSessionId: "s0",
            droppedCount: 8,
            at: 1,
          },
        },
      ],
    });
    generate.mockResolvedValueOnce({
      text: "<summary>SECOND</summary>",
      stepCount: 1,
      durationMs: 1,
    });
    const result = await runCompaction({ sessionId: "s1", mode: "manual" });
    const successor = useChatStore
      .getState()
      .sessions.find(
        (session) => result.ok && session.id === result.sessionId,
      );
    expect(successor?.title).toBe("↺ My chat");
    expect(successor?.compaction?.blocks).toEqual(["FIRST", "SECOND"]);
    expect(successor?.compaction?.transcriptIds).toEqual(["s0", "s1"]);
  });
});

describe("automatic compaction policy", () => {
  it("uses reported input tokens for the context ratio", () => {
    expect(contextFillRatio("s1")).toBeCloseTo(50_000 / 128_000);
  });

  it("compacts near the ceiling but honors a user refusal", () => {
    useChatStore.setState((state) => ({
      agentMeta: { ...state.agentMeta, lastInputTokens: 125_000 },
    }));
    expect(shouldCompactBeforeSend("s1")).toBe(true);
    useChatStore.setState((state) => ({
      sessions: state.sessions.map((session) => ({
        ...session,
        compactionPolicy: {
          declined: true,
          health: { consecutiveFailures: 0, turnsSinceCompact: 0, rapidRefills: 0 },
        },
      })),
    }));
    expect(shouldCompactBeforeSend("s1")).toBe(false);
  });

  it("uses the selected custom endpoint window for accounting and thresholds", () => {
    const disposeModels = configureSessionRuntime({
      preferences: {} as never,
      history: {} as never,
      models: [{
        id: "openai-compatible",
        label: "Compatible",
        keyringAccount: "",
        keyPrefix: null,
        consoleUrl: "https://example.invalid",
        keyRequirement: "optional",
        kind: "compatible",
        description: "Custom endpoints",
        models: [],
        defaultContextLimit: 128_000,
        customEndpoint: {
          modelIdPrefix: "compat-",
          keyringAccountPrefix: "compat-",
          keyringAccountSuffix: "-api-key",
          modelIdFor: (id) => `compat-${id}`,
          endpointIdFrom: (id) => id.startsWith("compat-") ? id.slice(7) : null,
          modelFor: (endpoint) => ({
            id: `compat-${endpoint.id}`,
            provider: "openai-compatible",
            label: endpoint.modelId,
            hint: endpoint.name,
            description: endpoint.baseURL,
            capabilities: { intelligence: 3, speed: 3, cost: 3 },
            contextWindow: endpoint.contextLimit,
          }),
        },
      }],
    });
    usePreferencesStore.setState({
      customEndpoints: [{
        id: "local",
        name: "Test",
        baseURL: "http://localhost:20128/v1",
        modelId: "gh/gpt-5.6-sol",
        contextLimit: 1_000_000,
      }],
    });
    useChatStore.setState({ selectedModelId: "compat-local" });

    expect(contextFillRatio("s1")).toBeCloseTo(50_000 / 1_000_000);

    disposeModels();
    usePreferencesStore.setState({ customEndpoints: [] });
  });
});
