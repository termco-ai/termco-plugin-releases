import { afterEach, beforeEach, expect, it, vi } from "vitest";
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


it.each(["new", "current", "rig", "delete"])("late cold-session load cannot override a newer %s selection", async (action) => {
  const a = canonicalWindow("cold-a");
  let resolveA!: (value: SessionWindow) => void;
  const pending = new Promise<SessionWindow>((resolve) => { resolveA = resolve; });
  const history = historyWith(a);
  vi.mocked(history.readWindow).mockImplementation(async (id) => String(id) === "cold-a" ? pending : canonicalWindow(String(id)));
  disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
  useChatStore.setState({ currentRigId: "rig-durable", activeSessionId: "cold-b", sessionsHydrated: true,
    sessions: ["cold-a", "cold-b"].map((id) => ({ id, rigId: "rig-durable", title: id, createdAt: 1, updatedAt: 1 })) });
  seedMessages.set("cold-b", []);
  useChatStore.getState().switchSession("cold-a");
  // Before A loads, explicitly choose a newly-created chat.
  if (action === "new") useChatStore.getState().newSession();
  if (action === "current") useChatStore.getState().switchSession("cold-b");
  if (action === "rig") useChatStore.getState().setCurrentRig("other-rig");
  if (action === "delete") await useChatStore.getState().deleteSession("cold-a");
  const latest = useChatStore.getState().activeSessionId;
  resolveA(a);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(useChatStore.getState().activeSessionId).toBe(latest);
});


it("persists the changed tool root before restoring a session after store reset", async () => {
  const window = canonicalWindow();
  const original = { ...window, header: { ...window.header, workspace: { rootHash: "original", rootPath: "/repo" } } };
  const history = historyWith(original);
  vi.mocked(history.append).mockImplementation(async (_id, events) => {
    original.events = [...original.events, ...events.map((event, index) => ({ ...event, seq: SessionSeq(original.events.length + index) }))] as typeof original.events;
    return undefined as never;
  });
  disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
  await aiSessionsCapability.openSession(original.header.id);
  await useChatStore.getState().patchSession(original.header.id, { workspaceRoot: "/repo/.git/termco-worktrees/review-42" });
  useChatStore.setState(useChatStore.getInitialState(), true);
  seedMessages.clear();
  await aiSessionsCapability.openSession(original.header.id);
  expect(useChatStore.getState().sessions[0].workspaceRoot).toBe("/repo/.git/termco-worktrees/review-42");
});

it("clears an old host's root on rig reassignment and restores the latest explicit binding", async () => {
  const initial = canonicalWindow();
  const window = { ...initial, header: { ...initial.header, workspace: { rootHash: "old", rootPath: "/old-host" } }, events: [...initial.events] };
  const history = historyWith(window);
  vi.mocked(history.append).mockImplementation(async (_id, events) => {
    window.events.push(...events.map((event, index) => ({ ...event, seq: SessionSeq(window.events.length + index) })) as typeof window.events);
    return undefined as never;
  });
  disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
  await aiSessionsCapability.openSession(window.header.id);
  await useChatStore.getState().patchSession(window.header.id, { workspaceRoot: "/old-review" });
  useChatStore.getState().reassignRig("rig-durable", "new-rig");
  expect(useChatStore.getState().sessions[0].workspaceRoot).toBeUndefined();
  await vi.waitFor(() => expect(window.events.some((event) => event.type === "session/rig")).toBe(true));
  await aiSessionsCapability.openSession(window.header.id);
  expect(useChatStore.getState().sessions[0]).toMatchObject({ rigId: "new-rig" });
  expect(useChatStore.getState().sessions[0].workspaceRoot).toBeUndefined();
  await useChatStore.getState().patchSession(window.header.id, { workspaceRoot: "/new-review" });
  await aiSessionsCapability.openSession(window.header.id);
  expect(useChatStore.getState().sessions[0].workspaceRoot).toBe("/new-review");
});

it("does not change the tool root if its durable write fails", async () => {
  const window = canonicalWindow();
  const history = historyWith(window);
  vi.mocked(history.append).mockRejectedValue(new Error("disk unavailable"));
  disposeRuntime = configureSessionRuntime({ preferences, history, models: [] });
  await aiSessionsCapability.openSession(window.header.id);
  await expect(useChatStore.getState().patchSession(window.header.id, { workspaceRoot: "/review" })).rejects.toThrow("disk unavailable");
  expect(useChatStore.getState().sessions[0].workspaceRoot).toBeUndefined();
});
