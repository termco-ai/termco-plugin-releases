import type {
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { describe, expect, it } from "vitest";
import { createMarkdownNavigation } from "./renderer";

function tabRuntime() {
  let snapshot: WorkspaceTabsSnapshot = {
    revision: 1,
    initialized: true,
    tabs: [
      { id: 1, rigId: "ssh-rig", kind: "terminal", title: "shell" },
    ],
    activeId: 1,
    splitTabId: 0,
    focusedPane: "left",
    booted: true,
    activeRigIdForNewTabs: "ssh-rig",
    activeTabByRig: {},
  };
  let nextId = 2;
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
    close: () => false,
    moveToRig: () => ({ changed: false, followTargetRig: false }),
    reorderAcrossRigs: () => ({ changed: false, followTargetRig: false }),
    reorderByGap: () => false,
    savedLayouts: () => [],
    saveLayout: async () => {},
    deleteLayout: async () => {},
  } satisfies WorkspaceTabsCapability;
  return { tabs, snapshot: () => snapshot };
}

describe("markdown navigation", () => {
  it("creates one rendered Markdown tab per path in the selected rig", () => {
    const runtime = tabRuntime();
    const navigation = createMarkdownNavigation(runtime.tabs);

    const first = navigation.open("/repo/README.md");
    const second = navigation.open("/repo/README.md");

    expect(second).toBe(first);
    expect(runtime.snapshot()).toMatchObject({ activeId: 2 });
    expect(runtime.snapshot().tabs.at(-1)).toEqual({
      id: 2,
      rigId: "ssh-rig",
      kind: "markdown",
      title: "README.md",
      data: { path: "/repo/README.md" },
    });
  });
});
