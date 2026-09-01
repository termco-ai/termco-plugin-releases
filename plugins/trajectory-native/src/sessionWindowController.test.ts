import {
  SessionId,
  SessionRevision,
  SessionSeq,
  TurnId,
  type SessionCommit,
  type SessionHistoryCapability,
  type SessionWindow,
  type SessionWindowRequest,
} from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { createSessionWindowController } from "./sessionWindowController";

const sessionId = SessionId("session-1");
const event = {
  type: "session/title" as const,
  seq: SessionSeq(7),
  time: 7,
  data: { title: "Current", source: "user" as const },
};
const window: SessionWindow = {
  header: {
    formatVersion: 2,
    id: sessionId,
    createdAt: 1,
    authority: "v2",
    backend: "chat",
    fidelity: "full",
  },
  events: [event],
  revision: SessionRevision(3),
  loadedRange: { start: 7, end: 7 },
  availability: { earlier: true, later: false },
  fidelity: "full",
  repair: { state: "healthy" },
};

async function waitForCommitBatch(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (
      typeof globalThis.window !== "undefined"
      && typeof document !== "undefined"
      && document.visibilityState === "visible"
      && typeof globalThis.window.requestAnimationFrame === "function"
    ) {
      globalThis.window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function runFrame(callback: FrameRequestCallback | null): void {
  if (callback === null) throw new Error("Expected an animation frame to be scheduled");
  callback(16);
}

describe("trajectory session window controller", () => {
  it("loads the tail through session.history and owns one live subscription", async () => {
    const requests: SessionWindowRequest[] = [];
    let listener: ((commit: SessionCommit) => void) | null = null;
    const dispose = vi.fn();
    const history = {
      readWindow: async (_id: string, request: SessionWindowRequest) => {
        requests.push(request);
        return window;
      },
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return dispose;
      },
    } as unknown as SessionHistoryCapability;

    const controller = createSessionWindowController(history, sessionId, { pageSize: 64 });
    await controller.start();

    expect(requests).toEqual([{ kind: "tail", limit: 64 }]);
    expect(controller.snapshot()).toMatchObject({
      loading: false,
      events: [event],
      revision: SessionRevision(3),
      hasEarlier: true,
      repair: { state: "healthy" },
    });
    expect(listener).toEqual(expect.any(Function));

    controller.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("loads an exact event window for causal navigation without reading the full session", async () => {
    const target = { ...event, seq: SessionSeq(41), time: 41, data: { title: "Cause", source: "user" as const } };
    const requests: SessionWindowRequest[] = [];
    const history = {
      readWindow: async (_id: string, request: SessionWindowRequest) => {
        requests.push(request);
        return request.kind === "tail"
          ? window
          : {
              ...window,
              events: [target],
              loadedRange: { start: 41, end: 41 },
              availability: { earlier: true, later: true },
            };
      },
      subscribe: () => () => {},
    } as unknown as SessionHistoryCapability;

    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    await controller.loadAround(SessionSeq(41));

    expect(requests).toEqual([
      { kind: "tail", limit: 256 },
      { kind: "range", start: SessionSeq(41), end: SessionSeq(41) },
    ]);
    expect(controller.snapshot().events).toEqual([event, target]);
  });

  it("refreshes owner-reported recovery metadata and preserves live events", async () => {
    const repaired: SessionWindow = {
      ...window,
      repair: { state: "repaired", repairedThroughSeq: SessionSeq(7), message: "Recovered open turn" },
    };
    let readCount = 0;
    const history = {
      readWindow: async () => (++readCount === 1 ? window : repaired),
      subscribe: () => () => {},
    } as unknown as SessionHistoryCapability;

    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    await controller.refresh();

    expect(controller.snapshot()).toMatchObject({
      repair: repaired.repair,
      events: [event],
      error: null,
    });
  });

  it("prepends an earlier page without changing current event identity", async () => {
    const earlier = { ...event, seq: SessionSeq(3), time: 3, data: { title: "Earlier", source: "user" as const } };
    const requests: SessionWindowRequest[] = [];
    const history = {
      readWindow: async (_id: string, request: SessionWindowRequest) => {
        requests.push(request);
        return request.kind === "tail"
          ? window
          : {
              ...window,
              events: [earlier],
              loadedRange: { start: 3, end: 3 },
              availability: { earlier: false, later: true },
            };
      },
      subscribe: () => () => {},
    } as unknown as SessionHistoryCapability;

    const controller = createSessionWindowController(history, sessionId, { pageSize: 64 });
    await controller.start();
    const current = controller.snapshot().events[0];
    await controller.loadEarlier();

    expect(requests).toEqual([
      { kind: "tail", limit: 64 },
      { kind: "before", seq: SessionSeq(7), limit: 64 },
    ]);
    expect(controller.snapshot().events).toEqual([earlier, current]);
    expect(controller.snapshot().events[1]).toBe(current);
    expect(controller.snapshot().hasEarlier).toBe(false);
  });

  it("merges a commit received while the tail page is still loading", async () => {
    let resolveWindow!: (value: SessionWindow) => void;
    const pendingWindow = new Promise<SessionWindow>((resolve) => {
      resolveWindow = resolve;
    });
    let listener!: (commit: SessionCommit) => void;
    const history = {
      readWindow: () => pendingWindow,
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return () => {};
      },
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    const started = controller.start();
    const live = { ...event, seq: SessionSeq(8), time: 8, data: { title: "Live", source: "user" as const } };

    listener({
      sessionId,
      events: [live],
      revision: SessionRevision(4),
      tailSeq: SessionSeq(8),
      durability: "memory",
    });
    resolveWindow(window);
    await started;

    expect(controller.snapshot()).toMatchObject({
      events: [event, live],
      revision: SessionRevision(4),
    });
  });

  it("keeps live events when the session advances while loading an earlier page", async () => {
    const earlier = { ...event, seq: SessionSeq(3), time: 3, data: { title: "Earlier", source: "user" as const } };
    const live = { ...event, seq: SessionSeq(8), time: 8, data: { title: "Live", source: "user" as const } };
    let listener!: (commit: SessionCommit) => void;
    let resolveEarlier!: (value: SessionWindow) => void;
    const earlierWindow = new Promise<SessionWindow>((resolve) => {
      resolveEarlier = resolve;
    });
    const history = {
      readWindow: (_id: string, request: SessionWindowRequest) =>
        request.kind === "tail" ? Promise.resolve(window) : earlierWindow,
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return () => {};
      },
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    const loading = controller.loadEarlier();

    listener({
      sessionId,
      events: [live],
      revision: SessionRevision(4),
      tailSeq: SessionSeq(8),
      durability: "written",
    });
    resolveEarlier({
      ...window,
      events: [earlier],
      availability: { earlier: false, later: true },
    });
    await loading;
    await waitForCommitBatch();

    expect(controller.snapshot()).toMatchObject({
      events: [earlier, event, live],
      revision: SessionRevision(4),
      error: null,
      hasEarlier: false,
    });
  });

  it("clears stale open-tail health when a live commit closes the turn", async () => {
    let listener!: (commit: SessionCommit) => void;
    const readWindow = vi.fn(async () => ({
      ...window,
      repair: { state: "open-tail" as const },
    }));
    const history = {
      readWindow,
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return () => {};
      },
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    await controller.start();

    listener({
      sessionId,
      events: [{
        type: "turn/end",
        seq: SessionSeq(8),
        time: 8,
        data: { turn: TurnId(1), reason: { kind: "completed" } },
      }],
      revision: SessionRevision(4),
      tailSeq: SessionSeq(8),
      durability: "written",
    });
    await waitForCommitBatch();

    expect(controller.snapshot()).toMatchObject({
      revision: SessionRevision(4),
      repair: { state: "healthy" },
    });
    expect(readWindow).toHaveBeenCalledOnce();
  });

  it("coalesces live commits across tasks into one animation-frame subscriber update", async () => {
    let frame: FrameRequestCallback | null = null;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 41;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame, cancelAnimationFrame });
    vi.stubGlobal("document", { visibilityState: "visible" });
    let listener!: (commit: SessionCommit) => void;
    const history = {
      readWindow: async () => window,
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return () => {};
      },
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    const observed = vi.fn();
    controller.subscribe(observed);

    try {
      for (let index = 0; index < 32; index += 1) {
        listener({
          sessionId,
          events: [{
            ...event,
            seq: SessionSeq(8 + index),
            time: 8 + index,
            data: { title: `Live ${index}`, source: "user" as const },
          }],
          revision: SessionRevision(4 + index),
          tailSeq: SessionSeq(8 + index),
          durability: "memory",
        });
        await Promise.resolve();
      }

      expect(requestAnimationFrame).toHaveBeenCalledOnce();
      expect(observed).not.toHaveBeenCalled();
      expect(frame).not.toBeNull();
      runFrame(frame);

      expect(observed).toHaveBeenCalledOnce();
      expect(controller.snapshot()).toMatchObject({
        revision: SessionRevision(35),
        events: expect.arrayContaining([
          expect.objectContaining({ seq: SessionSeq(8) }),
          expect.objectContaining({ seq: SessionSeq(39) }),
        ]),
      });
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("cancels a pending live-commit frame when disposed", async () => {
    let frame: FrameRequestCallback | null = null;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 42;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame, cancelAnimationFrame });
    vi.stubGlobal("document", { visibilityState: "visible" });
    let listener!: (commit: SessionCommit) => void;
    const history = {
      readWindow: async () => window,
      subscribe: (_id: string, next: (commit: SessionCommit) => void) => {
        listener = next;
        return () => {};
      },
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    const observed = vi.fn();
    controller.subscribe(observed);

    try {
      listener({
        sessionId,
        events: [{ ...event, seq: SessionSeq(8), time: 8 }],
        revision: SessionRevision(4),
        tailSeq: SessionSeq(8),
        durability: "memory",
      });
      controller.dispose();

      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      expect(frame).not.toBeNull();
      runFrame(frame);
      expect(observed).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("accepts an earlier page read from a newer durable revision", async () => {
    const earlier = { ...event, seq: SessionSeq(3), time: 3, data: { title: "Earlier", source: "user" as const } };
    const history = {
      readWindow: async (_id: string, request: SessionWindowRequest) =>
        request.kind === "tail"
          ? window
          : {
              ...window,
              revision: SessionRevision(4),
              events: [earlier],
              availability: { earlier: false, later: true },
            },
      subscribe: () => () => {},
    } as unknown as SessionHistoryCapability;
    const controller = createSessionWindowController(history, sessionId);
    await controller.start();
    await controller.loadEarlier();

    expect(controller.snapshot()).toMatchObject({
      events: [earlier, event],
      revision: SessionRevision(3),
      error: null,
      hasEarlier: false,
    });
  });
});
