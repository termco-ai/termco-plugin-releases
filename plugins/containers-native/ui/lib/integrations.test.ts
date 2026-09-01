import type {
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureContainerIntegrations,
  openContainerDetailTab,
} from "./integrations";

function tabRuntime() {
  let snapshot: WorkspaceTabsSnapshot = {
    revision: 1,
    initialized: true,
    tabs: [
      { id: 1, rigId: "remote", kind: "terminal", title: "shell" },
    ],
    activeId: 1,
    splitTabId: 0,
    focusedPane: "left",
    booted: true,
    activeRigIdForNewTabs: "remote",
    activeTabByRig: {},
  };
  let nextId = 2;
  const tabs = {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: () => {},
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

afterEach(() =>
  configureContainerIntegrations({ ssh: null, browser: null, tabs: null }),
);

describe("container tab integration", () => {
  it("creates the exact source-owned container record in the active rig", () => {
    const runtime = tabRuntime();
    configureContainerIntegrations({
      ssh: null,
      browser: null,
      tabs: runtime.tabs,
    });

    expect(
      openContainerDetailTab({ runtime: "docker", id: "abc", name: "web" }),
    ).toBe(2);
    expect(runtime.snapshot()).toMatchObject({ activeId: 2 });
    expect(runtime.snapshot().tabs.at(-1)).toEqual({
      id: 2,
      rigId: "remote",
      kind: "container",
      title: "web",
      data: { runtime: "docker", containerId: "abc", name: "web" },
    });
  });

  it("reuses the runtime/id pair and refreshes its name", () => {
    const runtime = tabRuntime();
    configureContainerIntegrations({
      ssh: null,
      browser: null,
      tabs: runtime.tabs,
    });

    const first = openContainerDetailTab({
      runtime: "docker",
      id: "abc",
      name: "web",
    });
    const second = openContainerDetailTab({
      runtime: "docker",
      id: "abc",
      name: "web-renamed",
    });

    expect(second).toBe(first);
    expect(
      runtime.snapshot().tabs.filter((tab) => tab.kind === "container"),
    ).toHaveLength(1);
    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      title: "web-renamed",
      data: { name: "web-renamed" },
    });
  });
});
