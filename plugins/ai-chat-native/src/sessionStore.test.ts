import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreferencesCapability } from "@termco/storage-base";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionRevision,
  SessionSeq,
  TurnId,
  type SessionHeader,
  type SessionHistoryCapability,
  type SessionWindow,
} from "@termco/session-base";
import { configureSessionRuntime } from "./runtime";
import { aiSessionsCapability, useChatStore } from "./store/store";
import { chats, seedMessages, toolContexts } from "./store/registry";

const preferences = {
  get: vi.fn(async () => undefined),
  getMany: vi.fn(async () => ({})),
  set: vi.fn(async () => undefined),
  delete: vi.fn(async () => false),
  subscribe: vi.fn(() => () => undefined),
} as unknown as PreferencesCapability;

function canonicalWindow(sessionId = "durable-session"): SessionWindow {
  const header: SessionHeader = {
    formatVersion: SESSION_FORMAT_VERSION,
    id: SessionId(sessionId),
    createdAt: 100,
    authority: "v2",
    backend: "chat",
    fidelity: "full",
    rigId: "rig-durable",
  };
  return {
    header,
    events: [
      {
        type: "session/title",
        seq: SessionSeq(0),
        time: 100,
        data: { title: "Durable prompt", source: "user" },
      },
      {
        type: "turn/start",
        seq: SessionSeq(1),
        time: 110,
        data: { turn: TurnId(1), cause: "user" },
      },
      {
        type: "user/message",
        seq: SessionSeq(2),
        time: 120,
        data: {
          turn: TurnId(1),
          message: {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Durable prompt" }],
          },
          source: "human",
        },
        surfaceOp: { op: "append" },
      },
    ],
    revision: SessionRevision(4),
    loadedRange: { start: 0, end: 2 },
    availability: { earlier: false, later: false },
    fidelity: "full",
    repair: { state: "healthy" },
  };
}

function historyWith(window: SessionWindow): SessionHistoryCapability {
  return {
    create: vi.fn(),
    append: vi.fn(),
    readWindow: vi.fn(async () => window),
    inspect: vi.fn(async () => ({
      sessionId: window.header.id,
      state: "healthy",
      revision: window.revision,
      tailSeq: window.events.at(-1)?.seq,
    })),
    flush: vi.fn(),
    fork: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as SessionHistoryCapability;
}

let disposeRuntime: (() => void) | undefined;

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true);
  chats.clear();
  seedMessages.clear();
  toolContexts.clear();
});

afterEach(() => {
  disposeRuntime?.();
  disposeRuntime = undefined;
  vi.clearAllMocks();
});

describe("AI session provider", () => {
  it("keeps dock and mini-window navigation mutually exclusive", () => {
    useChatStore.setState({ panelOpen: false, mini: { open: false } });
    aiSessionsCapability.openPanel();
    expect(aiSessionsCapability.snapshot()).toMatchObject({
      panelOpen: true,
      miniOpen: false,
    });
    aiSessionsCapability.openMini();
    expect(aiSessionsCapability.snapshot()).toMatchObject({
      panelOpen: false,
      miniOpen: true,
    });
  });

  it("discovers and restores a durable canonical session before opening it", async () => {
    const window = canonicalWindow();
    const history = historyWith(window);
    disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });

    await aiSessionsCapability.openSession(window.header.id);

    expect(history.readWindow).toHaveBeenCalledWith(window.header.id, {
      kind: "head",
      limit: 512,
    });
    expect(useChatStore.getState()).toMatchObject({
      activeSessionId: "durable-session",
      currentRigId: "rig-durable",
      panelOpen: true,
      sessions: [
        {
          id: "durable-session",
          title: "Durable prompt",
          rigId: "rig-durable",
          createdAt: 100,
          updatedAt: 120,
        },
      ],
    });
    expect(seedMessages.get("durable-session")).toEqual([
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "Durable prompt" }],
      },
    ]);
  });

  it("keeps the current presentation intact when canonical restoration fails", async () => {
    const history = historyWith(canonicalWindow());
    history.readWindow = vi.fn(async () => {
      throw Object.assign(new Error("session missing"), {
        code: "SESSION_NOT_FOUND",
      });
    });
    disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
    useChatStore.setState({
      activeSessionId: "current-session",
      currentRigId: "current-rig",
      sessions: [{
        id: "current-session",
        title: "Current",
        rigId: "current-rig",
        createdAt: 1,
        updatedAt: 2,
      }],
      panelOpen: false,
      mini: { open: true },
    });

    await expect(
      aiSessionsCapability.openSession(SessionId("missing-session")),
    ).rejects.toThrow("session missing");

    expect(useChatStore.getState()).toMatchObject({
      activeSessionId: "current-session",
      currentRigId: "current-rig",
      sessions: [{ id: "current-session", title: "Current" }],
      panelOpen: false,
      mini: { open: true },
    });
    expect(seedMessages.has("missing-session")).toBe(false);
  });

  it("reruns by canonical fork, durable reopen, and structured prompt resend", async () => {
    const parent = canonicalWindow("parent-session");
    const child: SessionWindow = {
      ...canonicalWindow("child-session"),
      events: [
        {
          type: "session/title",
          seq: SessionSeq(0),
          time: 200,
          data: { title: "Rerun", source: "user" },
        },
      ],
      loadedRange: { start: 0, end: 0 },
      revision: SessionRevision(1),
    };
    const history = historyWith(parent);
    history.readWindow = vi.fn(async (sessionId) =>
      sessionId === child.header.id ? child : parent
    );
    history.fork = vi.fn(async () => ({
      childSessionId: child.header.id,
      parentSessionId: parent.header.id,
      boundary: {
        requested: { kind: "event" as const, seq: SessionSeq(2) },
        resolvedSeq: SessionSeq(1),
        seedLength: 2,
        structuralState: "balanced" as const,
      },
      revision: SessionRevision(1),
    }));
    const resend = vi.fn(async () => undefined);
    disposeRuntime = configureSessionRuntime({
      preferences,
      history,
      models: [],
      sendMessage: resend,
    });

    const result = await aiSessionsCapability.rerunFrom({
      sessionId: parent.header.id,
      eventSeq: SessionSeq(2),
    });

    expect(history.fork).toHaveBeenCalledWith({
      sessionId: parent.header.id,
      boundary: { kind: "event", seq: SessionSeq(2) },
      origin: "rerun",
    });
    expect(useChatStore.getState().activeSessionId).toBe("child-session");
    expect(resend).toHaveBeenCalledWith("child-session", {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "Durable prompt" }],
    });
    expect(result).toEqual({ childSessionId: child.header.id });
    expect(history.readWindow).toHaveBeenCalledWith(child.header.id, {
      kind: "head",
      limit: 512,
    });
  });

  it("forks only through session history and opens the committed child", async () => {
    const parent = canonicalWindow("parent-session");
    const child = canonicalWindow("child-session");
    const history = historyWith(parent);
    history.readWindow = vi.fn(async (sessionId) =>
      sessionId === child.header.id ? child : parent
    );
    history.fork = vi.fn(async () => ({
      childSessionId: child.header.id,
      parentSessionId: parent.header.id,
      boundary: {
        requested: { kind: "event" as const, seq: SessionSeq(2) },
        resolvedSeq: SessionSeq(2),
        seedLength: 3,
        structuralState: "balanced" as const,
      },
      revision: SessionRevision(1),
    }));
    disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
    useChatStore.setState({
      currentRigId: "rig-durable",
      sessions: [{
        id: "parent-session",
        title: "Parent",
        rigId: "rig-durable",
        createdAt: 100,
        updatedAt: 120,
      }],
      activeSessionId: "parent-session",
    });

    const childId = await useChatStore.getState().forkSession({
      sourceSessionId: "parent-session",
      boundary: { kind: "event", seq: SessionSeq(2) },
      title: "Branch",
      origin: "fork",
    });

    expect(history.fork).toHaveBeenCalledWith({
      sessionId: parent.header.id,
      boundary: { kind: "event", seq: SessionSeq(2) },
      title: "Branch",
      origin: "fork",
    });
    expect(childId).toBe("child-session");
    expect(useChatStore.getState().activeSessionId).toBe("child-session");
  });
});
