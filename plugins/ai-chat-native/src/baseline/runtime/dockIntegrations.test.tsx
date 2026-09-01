// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type {
  WorkspaceRigsCapability,
  WorkspaceRigsSnapshot,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodingAgentsPanel,
  configureDockIntegrations,
  useActiveAgentContext,
} from "./dockIntegrations";

const rig = {
  id: "local",
  name: "Local",
  root: "/workspace",
  workspace: { kind: "local" as const },
  createdAt: 1,
  updatedAt: 1,
};

function mockRigs(snapshot: WorkspaceRigsSnapshot): WorkspaceRigsCapability {
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    create: vi.fn(),
    rename: vi.fn(),
    setWorkspace: vi.fn(),
    setColor: vi.fn(),
    reorder: vi.fn(),
    remove: vi.fn(),
    activate: vi.fn(),
    cycle: vi.fn(),
  };
}

function mockTabs(snapshot: WorkspaceTabsSnapshot): WorkspaceTabsCapability {
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: vi.fn(),
    allocate: vi.fn(() => []),
    transition: vi.fn(),
    nextActiveInRig: vi.fn(() => null),
    selectByRigIndex: vi.fn(() => null),
    close: vi.fn(() => false),
    moveToRig: vi.fn(() => ({ changed: false, followTargetRig: false })),
    reorderAcrossRigs: vi.fn(() => ({
      changed: false,
      followTargetRig: false,
    })),
    reorderByGap: vi.fn(() => false),
    savedLayouts: vi.fn(() => []),
    saveLayout: vi.fn(async () => {}),
    deleteLayout: vi.fn(async () => {}),
  };
}

function mountWithActiveTab(
  tab: ReturnType<WorkspaceTabsCapability["snapshot"]>["tabs"][number],
) {
  const rigSnapshot = { hydrated: true, rigs: [rig], activeId: rig.id };
  const rigs = mockRigs(rigSnapshot);
  const tabSnapshot = {
    revision: 1,
    initialized: true,
    tabs: [tab],
    activeId: tab.id,
    splitTabId: 0,
    focusedPane: "left" as const,
    booted: true,
    activeRigIdForNewTabs: rig.id,
    activeTabByRig: { [rig.id]: tab.id },
  };
  const tabs = mockTabs(tabSnapshot);
  const dispose = configureDockIntegrations({
    rigs,
    tabs,
    views: [],
    trajectory: null,
  });
  const rendered = renderHook(() => useActiveAgentContext("/fallback"));
  return { ...rendered, dispose };
}

afterEach(cleanup);

describe("coding-agent working directory", () => {
  it("prefills the active terminal cwd instead of the rig root", () => {
    const mounted = mountWithActiveTab({
      id: 7,
      rigId: rig.id,
      kind: "terminal",
      title: "shell",
      data: {
        paneTree: { kind: "leaf", id: 70, cwd: "/Applications" },
        activeLeafId: 70,
        cwd: "/Applications",
      },
    });

    expect(mounted.result.current.cwd).toBe("/Applications");
    mounted.dispose();
  });

  it("prefills the folder containing the active file", () => {
    const mounted = mountWithActiveTab({
      id: 8,
      rigId: rig.id,
      kind: "editor",
      title: "PkgInfo",
      data: { path: "/Applications/Termco.app/Contents/PkgInfo" },
    });

    expect(mounted.result.current.cwd).toBe(
      "/Applications/Termco.app/Contents",
    );
    mounted.dispose();
  });

  it("passes the resolved open location through to the Agents dock view", () => {
    const rigSnapshot = { hydrated: true, rigs: [rig], activeId: rig.id };
    const rigs = mockRigs(rigSnapshot);
    const tabSnapshot = {
      revision: 1,
      initialized: true,
      tabs: [],
      activeId: 0,
      splitTabId: 0,
      focusedPane: "left" as const,
      booted: true,
      activeRigIdForNewTabs: rig.id,
      activeTabByRig: {},
    };
    const tabs = mockTabs(tabSnapshot);
    const dispose = configureDockIntegrations({
      rigs,
      tabs,
      views: [
        {
          id: "agents",
          label: "Agents",
          description: "",
          Component: ({ runtime }) => <span>{runtime.cwd}</span>,
        },
      ],
      trajectory: null,
    });

    render(
      <CodingAgentsPanel
        defaultCwd="/Applications"
        workspace={{ kind: "local" }}
      />,
    );

    expect(screen.getByText("/Applications")).toBeTruthy();
    dispose();
  });
});
