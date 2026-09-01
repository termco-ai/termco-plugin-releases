import { describe, expect, it, vi } from "vitest";
import { AgentActivityStore } from "./activity";

describe("AgentActivityStore", () => {
  it("publishes one coherent shared session snapshot", () => {
    const store = new AgentActivityStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.start(7, 3, "claude");
    expect(store.snapshot().sessions).toMatchObject([
      { leafId: 7, tabId: 3, agent: "claude", status: "working" },
    ]);
    store.setStatus(7, "waiting");
    expect(store.nextAttentionTarget()).toEqual({ tabId: 3, leafId: 7 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("selects the newest waiting session as the attention target", () => {
    const store = new AgentActivityStore();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(3);
    store.start(7, 3, "claude");
    store.setStatus(7, "waiting");
    store.start(8, 4, "codex");
    now.mockReturnValueOnce(4);
    store.setStatus(8, "waiting");
    expect(store.nextAttentionTarget()).toEqual({ tabId: 4, leafId: 8 });
    now.mockRestore();
  });

  it("records, marks, clears, and bounds notifications", () => {
    const store = new AgentActivityStore();
    for (let index = 0; index < 55; index += 1) {
      store.pushNotification({
        source: "terminal",
        leafId: index,
        tabId: index,
        agent: "codex",
        kind: "attention",
      });
    }
    expect(store.snapshot().notifications).toHaveLength(50);
    expect(store.snapshot().notifications[0].read).toBe(false);
    store.markAllRead();
    expect(store.snapshot().notifications.every((item) => item.read)).toBe(true);
    store.clearNotifications();
    expect(store.snapshot().notifications).toEqual([]);
  });

  it("removes exited sessions and disposes subscriptions", () => {
    const store = new AgentActivityStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.start(7, 3, "claude");
    store.finish(7);
    expect(store.snapshot().sessions).toEqual([]);
    expect(store.nextAttentionTarget()).toBeNull();
    store.dispose();
    const calls = listener.mock.calls.length;
    store.start(8, 4, "codex");
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("publishes lifecycle facts without coupling the store to AI reactions", () => {
    const store = new AgentActivityStore();
    const listener = vi.fn();
    const dispose = store.subscribeEvents(listener);
    store.emit({ kind: "finished", leafId: 7 });
    expect(listener).toHaveBeenCalledWith({ kind: "finished", leafId: 7 });
    dispose();
    store.emit({ kind: "exited", leafId: 7 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes and activates the local agent without exposing its callback", () => {
    const store = new AgentActivityStore();
    const activate = vi.fn();
    store.setLocalAgent({ agent: "Termco", status: "working", activate });
    expect(store.snapshot().localAgent).toEqual({
      agent: "Termco",
      status: "working",
    });
    expect(store.snapshot().localAgent).not.toHaveProperty("activate");
    store.activateLocalAgent();
    expect(activate).toHaveBeenCalledOnce();
    store.setLocalAgent(null);
    store.activateLocalAgent();
    expect(activate).toHaveBeenCalledOnce();
  });
});
