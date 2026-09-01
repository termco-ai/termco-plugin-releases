import { describe, expect, it, vi } from "vitest";
import type { PreferencesCapability } from "@termco/storage-base";
import { WORKSPACE_TAB_LAYOUTS_KEY, WorkspaceTabsStore } from "./store";

function preferences(initial?: unknown) {
  let value = initial;
  const capability: PreferencesCapability = {
    get: vi.fn(async () => value) as PreferencesCapability["get"],
    getMany: vi.fn(async () => ({})),
    set: vi.fn(async (key, next) => {
      if (key === WORKSPACE_TAB_LAYOUTS_KEY) value = next;
    }),
    delete: vi.fn(async () => false),
    subscribe: () => () => {},
  };
  return { capability, read: () => value };
}

function createStore() {
  return new WorkspaceTabsStore(preferences().capability);
}

const terminal = (id: number, cold = false, rigId = "default") => ({
  id,
  rigId,
  kind: "terminal",
  title: `Terminal ${id}`,
  cold,
});

describe("WorkspaceTabsStore", () => {
  it("initializes once, allocates beyond imported ids, and publishes atomically", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.initialize({ tabs: [terminal(4)], activeId: 4 });
    store.initialize({ tabs: [terminal(9)], activeId: 9 });
    expect(store.snapshot().tabs.map((tab) => tab.id)).toEqual([4]);
    expect(store.allocate(2)).toEqual([5, 6]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("warms the active tab after boot and clears removed selections", () => {
    const store = createStore();
    store.initialize({
      tabs: [terminal(1, true), terminal(2)],
      activeId: 1,
      splitTabId: 2,
    });
    store.transition({ booted: true });
    expect(store.snapshot().tabs[0].cold).toBe(false);
    store.transition({ tabs: [terminal(2)] });
    expect(store.snapshot()).toMatchObject({ activeId: 0, splitTabId: 2 });
  });

  it("owns split-pane focus and resets it when the split closes", () => {
    const store = createStore();
    store.initialize({
      tabs: [terminal(1), terminal(2)],
      activeId: 1,
      splitTabId: 2,
    });

    store.transition({ focusedPane: "right" });
    expect(store.snapshot().focusedPane).toBe("right");

    store.transition({ splitTabId: 0 });
    expect(store.snapshot()).toMatchObject({
      splitTabId: 0,
      focusedPane: "left",
    });

    store.transition({ focusedPane: "right" });
    expect(store.snapshot().focusedPane).toBe("left");
  });

  it("closes tabs atomically without selecting the split tab in both panes", () => {
    const store = createStore();
    store.initialize({
      tabs: [terminal(1), terminal(2)],
      activeId: 1,
      splitTabId: 2,
      focusedPane: "right",
    });
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.close(1)).toBe(true);
    expect(store.snapshot()).toMatchObject({
      tabs: [expect.objectContaining({ id: 2 })],
      activeId: 0,
      splitTabId: 2,
      focusedPane: "right",
    });
    expect(listener).toHaveBeenCalledTimes(1);

    expect(store.close(2)).toBe(true);
    expect(store.snapshot()).toMatchObject({
      tabs: [],
      activeId: 0,
      splitTabId: 0,
      focusedPane: "left",
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.close(99)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate ids and one tab in both panes", () => {
    const store = createStore();
    expect(() =>
      store.initialize({ tabs: [terminal(1), terminal(1)], activeId: 1 }),
    ).toThrow("Duplicate");
    store.initialize({ tabs: [terminal(1)], activeId: 1 });
    expect(() => store.transition({ splitTabId: 1 })).toThrow("both split panes");
  });

  it("resolves and selects tabs only within the requested rig", () => {
    const store = createStore();
    const listener = vi.fn();
    store.initialize({
      tabs: [
        terminal(1, false, "a"),
        terminal(2, false, "b"),
        terminal(3, false, "b"),
      ],
      activeId: 1,
    });
    store.subscribe(listener);

    expect(store.nextActiveInRig(2)).toBe(3);
    expect(store.nextActiveInRig(3)).toBe(2);
    expect(store.nextActiveInRig(1)).toBeNull();
    expect(store.nextActiveInRig(99)).toBeNull();
    expect(store.selectByRigIndex(1, "b")).toBe(3);
    expect(store.snapshot().activeId).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(store.selectByRigIndex(2, "b")).toBeNull();
    expect(store.selectByRigIndex(0, "missing")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("owns the last active tab for each rig and removes stale mappings", () => {
    const store = createStore();
    store.initialize({
      tabs: [terminal(1, false, "a"), terminal(2, false, "b")],
      activeId: 1,
    });
    expect(store.snapshot().activeTabByRig).toEqual({ a: 1 });

    store.transition({ activeId: 2 });
    expect(store.snapshot().activeTabByRig).toEqual({ a: 1, b: 2 });

    store.transition({ tabs: [terminal(2, false, "b")] });
    expect(store.snapshot().activeTabByRig).toEqual({ b: 2 });
  });

  it("moves a tab between rigs in one published transition", () => {
    const store = createStore();
    const listener = vi.fn();
    store.initialize({
      tabs: [
        terminal(1, false, "a"),
        terminal(2, false, "a"),
        terminal(3, false, "b"),
      ],
      activeId: 2,
      splitTabId: 3,
    });
    store.subscribe(listener);

    expect(store.moveToRig(2, "b")).toEqual({
      changed: true,
      followTargetRig: false,
    });
    expect(store.snapshot()).toMatchObject({ activeId: 1, splitTabId: 3 });
    expect(store.snapshot().tabs.find((tab) => tab.id === 2)?.rigId).toBe("b");
    expect(listener).toHaveBeenCalledTimes(1);

    expect(store.moveToRig(3, "a")).toEqual({
      changed: true,
      followTargetRig: false,
    });
    expect(store.snapshot().splitTabId).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.moveToRig(99, "a")).toEqual({
      changed: false,
      followTargetRig: false,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("tells the UI to follow an active tab that emptied its source rig", () => {
    const store = createStore();
    store.initialize({
      tabs: [terminal(1, false, "a"), terminal(2, false, "b")],
      activeId: 1,
    });

    expect(store.moveToRig(1, "b")).toEqual({
      changed: true,
      followTargetRig: true,
    });
    expect(store.snapshot()).toMatchObject({ activeId: 1 });
    expect(store.snapshot().tabs.map((tab) => tab.rigId)).toEqual(["b", "b"]);
  });

  it("reorders across rigs and resolves the source selection atomically", () => {
    const store = createStore();
    const listener = vi.fn();
    store.initialize({
      tabs: [
        terminal(1, false, "a"),
        terminal(3, false, "b"),
        terminal(2, false, "a"),
        terminal(4, false, "b"),
      ],
      activeId: 2,
      splitTabId: 4,
    });
    store.subscribe(listener);

    expect(store.reorderAcrossRigs(2, 3, "top")).toEqual({
      changed: true,
      followTargetRig: false,
    });
    expect(store.snapshot().tabs.map((tab) => [tab.id, tab.rigId])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "b"],
      [4, "b"],
    ]);
    expect(store.snapshot()).toMatchObject({ activeId: 1, splitTabId: 4 });
    expect(listener).toHaveBeenCalledTimes(1);

    expect(store.reorderAcrossRigs(4, 1, "bottom")).toEqual({
      changed: true,
      followTargetRig: false,
    });
    expect(store.snapshot().splitTabId).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("reorders by a rig-local gap without disturbing other rigs", () => {
    const store = createStore();
    const listener = vi.fn();
    store.initialize({
      tabs: [
        terminal(1, false, "a"),
        terminal(2, false, "b"),
        terminal(3, false, "a"),
        terminal(4, false, "b"),
      ],
      activeId: 1,
    });
    store.subscribe(listener);

    expect(store.reorderByGap(1, 2)).toBe(true);
    expect(store.snapshot().tabs.map((tab) => tab.id)).toEqual([2, 3, 1, 4]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.reorderByGap(1, 2)).toBe(false);
    expect(store.reorderByGap(99, 1)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hydrates, saves, clones, and deletes per-rig layouts", async () => {
    const backing = preferences([
      {
        rigId: "remote",
        tabs: [{ kind: "terminal", tree: { kind: "leaf", cwd: "/srv" } }],
        activeTabIndex: 0,
        splitTabIndex: -1,
      },
    ]);
    const tabs = new WorkspaceTabsStore(backing.capability);
    await tabs.hydrate();
    const restored = tabs.savedLayouts();
    expect(restored[0]).toMatchObject({ rigId: "remote", activeTabIndex: 0 });

    await tabs.saveLayout({
      rigId: "local",
      tabs: [{ kind: "editor", path: "/tmp/a.ts" }],
      activeTabIndex: 0,
      splitTabIndex: -1,
    });
    expect(tabs.savedLayouts().map((layout) => layout.rigId)).toEqual([
      "remote",
      "local",
    ]);
    await tabs.deleteLayout("remote");
    expect(tabs.savedLayouts().map((layout) => layout.rigId)).toEqual(["local"]);
    expect(backing.read()).toEqual(tabs.savedLayouts());
  });
});
