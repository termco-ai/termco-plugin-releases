import type { WorkspaceTabsCapability, WorkspaceTabsSnapshot } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { createBrowserTabsController } from "./tabs";

function tabRuntime(
  overrides: Partial<WorkspaceTabsSnapshot> = {},
): {
  tabs: WorkspaceTabsCapability;
  snapshot(): WorkspaceTabsSnapshot;
} {
  let snapshot: WorkspaceTabsSnapshot = {
    revision: 1,
    initialized: true,
    tabs: [
      {
        id: 1,
        rigId: "a",
        kind: "preview",
        title: "A",
        data: { url: "https://a" },
      },
      { id: 2, rigId: "a", kind: "editor", title: "B" },
    ],
    activeId: 1,
    splitTabId: 0,
    focusedPane: "left",
    booted: true,
    activeRigIdForNewTabs: "a",
    ...overrides,
    activeTabByRig: overrides.activeTabByRig ?? {},
  };
  let nextId = 3;
  const close = vi.fn((id: number) => {
    if (!snapshot.tabs.some((tab) => tab.id === id)) return false;
    snapshot = {
      ...snapshot,
      tabs: snapshot.tabs.filter((tab) => tab.id !== id),
      revision: snapshot.revision + 1,
    };
    return true;
  });
  const tabs = {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: (next) => {
      snapshot = { ...snapshot, ...next, initialized: true };
    },
    allocate: (count = 1) =>
      Array.from({ length: count }, () => nextId++),
    transition: (next) => {
      snapshot = { ...snapshot, ...next, revision: snapshot.revision + 1 };
    },
    nextActiveInRig: () => null,
    selectByRigIndex: () => null,
    close,
    moveToRig: () => ({ changed: false, followTargetRig: false }),
    reorderAcrossRigs: () => ({ changed: false, followTargetRig: false }),
    reorderByGap: () => false,
    savedLayouts: () => [],
    saveLayout: async () => {},
    deleteLayout: async () => {},
  } satisfies WorkspaceTabsCapability;
  return { tabs, snapshot: () => snapshot };
}

describe("browser tabs controller", () => {
  it("owns preview records and delegates close only for preview tabs", () => {
    const runtime = tabRuntime();
    const tabs = createBrowserTabsController(runtime.tabs);

    expect(tabs.active("a")).toBe(1);
    expect(tabs.list("a")).toEqual([
      { id: 1, rigId: "a", url: "https://a", title: "A" },
    ]);
    expect(tabs.select(2)).toBe(false);
    expect(tabs.close(2)).toBe(false);
    expect(tabs.close(1)).toBe(true);
    expect(runtime.snapshot().tabs).toHaveLength(1);
  });

  it("opens the exact preview payload in the active rig", () => {
    const runtime = tabRuntime();
    const tabs = createBrowserTabsController(runtime.tabs);

    expect(tabs.open("https://example.com/path")).toBe(3);
    expect(runtime.snapshot()).toMatchObject({ activeId: 3 });
    expect(runtime.snapshot().tabs.at(-1)).toEqual({
      id: 3,
      rigId: "a",
      kind: "preview",
      title: "example.com",
      data: { url: "https://example.com/path" },
    });
  });

  it("routes a new preview to the focused right split without replacing the left tab", () => {
    const runtime = tabRuntime({
      splitTabId: 2,
      focusedPane: "right",
    });
    const tabs = createBrowserTabsController(runtime.tabs);

    tabs.open("");

    expect(runtime.snapshot()).toMatchObject({
      activeId: 1,
      splitTabId: 3,
      focusedPane: "right",
    });
    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      id: 3,
      kind: "preview",
      title: "preview",
      data: { url: "" },
    });
  });
});
