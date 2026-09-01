import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HeaderRuntimeCapabilities } from "./runtime";
import { useHeaderRuntime } from "./runtime";

class BoundStore<T> {
  readonly listeners = new Set<() => void>();

  constructor(public value: T) {}

  snapshot(): T {
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }
}

function capabilities() {
  const presentation = new BoundStore({
    revision: 1,
    header: {
      tabs: [
        {
          id: 2,
          rigId: "remote",
          kind: "terminal",
          label: "Terminal",
          title: "Terminal",
          dirty: false,
          preview: false,
          private: false,
        },
      ],
      allTabs: [
        {
          id: 2,
          rigId: "remote",
          kind: "terminal",
          label: "Terminal",
          title: "Terminal",
          dirty: false,
          preview: false,
          private: false,
        },
      ],
      activeTabId: 2,
      agentsViewOpen: false,
      editorDirty: true,
      findTarget: null,
    },
    sidebar: {
      rootPath: "/remote",
      workspace: { kind: "ssh" as const, connectionId: "ssh-1" },
      activeFilePath: null,
    },
    context: {
      cwd: "/remote",
      filePath: null,
      home: "/root",
      privateActive: false,
      zenMode: false,
    },
  });
  const aiSessions = Object.assign(
    new BoundStore({
      revision: 1,
      panelOpen: false,
      miniOpen: true,
      selectedModelId: "model",
      activeSessionId: null,
      agent: { status: "idle" as const, step: null, error: null },
    }),
    {
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      togglePanel: vi.fn(),
      openMini: vi.fn(),
      closeMini: vi.fn(),
      focusInput: vi.fn(),
    },
  );
  const agentsView = Object.assign(
    new BoundStore({ revision: 1, open: false, openSequence: 0 }),
    { show: vi.fn(), close: vi.fn(), toggle: vi.fn() },
  );
  const settingsView = Object.assign(
    new BoundStore({
      revision: 1,
      open: false,
      requestedSection: null,
      openSequence: 0,
    }),
    { show: vi.fn(), close: vi.fn(), toggle: vi.fn() },
  );
  const commandPalette = Object.assign(
    new BoundStore({
      revision: 1,
      open: false,
      mode: "commands" as const,
      anchor: null,
      inputSlot: null,
    }),
    {
      show: vi.fn(),
      close: vi.fn(),
      setOpen: vi.fn(),
      setAnchor: vi.fn(),
      setInputSlot: vi.fn(),
    },
  );
  const rigs = Object.assign(
    new BoundStore({
      hydrated: true,
      activeId: "local",
      rigs: [
        {
          id: "remote",
          name: "Remote",
          root: "/remote",
          workspace: { kind: "ssh" as const, connectionId: "ssh-1" },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    {
      activate: vi.fn(),
      rename: vi.fn(),
      reorder: vi.fn(),
      remove: vi.fn(),
    },
  );
  const tabs = Object.assign(
    new BoundStore({
      revision: 1,
      initialized: true,
      tabs: [
        {
          id: 2,
          rigId: "remote",
          kind: "terminal",
          title: "Terminal",
          data: { activeLeafId: 7 },
        },
      ],
      activeId: 2,
      splitTabId: 2,
      focusedPane: "left" as "left" | "right",
      booted: true,
      activeRigIdForNewTabs: "remote",
      activeTabByRig: { remote: 2 },
    }),
    {
      transition: vi.fn(),
      reorderByGap: vi.fn(),
      moveToRig: vi.fn(() => ({ changed: true, followTargetRig: true })),
      reorderAcrossRigs: vi.fn(() => ({
        changed: true,
        followTargetRig: true,
      })),
    },
  );
  const terminalSessions = {
    open: vi.fn(() => ({ tabId: 3, leafId: 8 })),
    focus: vi.fn(() => true),
  };
  const stopResize = vi.fn();
  const desktopWindow = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(() => stopResize),
  };
  const values = {
    aiSessions,
    agentsView,
    browserTabs: { open: vi.fn(() => 3) },
    commandPalette,
    desktopWindow,
    editorNavigation: {
      openNewFile: vi.fn(),
      pin: vi.fn(),
      setLanguage: vi.fn(),
    },
    editorSessions: { save: vi.fn(async () => true) },
    presentation,
    rigWorkflows: {
      createLocal: vi.fn(() => "new"),
      createSsh: vi.fn(async () => "ssh"),
      remove: vi.fn(),
    },
    rigs,
    settingsView,
    sidebarNavigation: { toggle: vi.fn() },
    tabActions: {
      close: vi.fn(),
      closeMany: vi.fn(),
      newRightOf: vi.fn(),
      duplicate: vi.fn(),
      rename: vi.fn(),
    },
    tabs,
    terminalSessions,
  } as unknown as HeaderRuntimeCapabilities;
  return {
    values,
    agentsView,
    commandPalette,
    desktopWindow,
    stopResize,
    rigs,
    presentation,
    settingsView,
    tabs,
    terminalSessions,
  };
}

describe("source-owned header runtime", () => {
  it("reads bound provider stores and routes established actions", () => {
    const deps = capabilities();
    const { result, unmount } = renderHook(() => useHeaderRuntime(deps.values));

    expect(result.current).toMatchObject({
      aiPanelOpen: true,
      activeTabId: 2,
      activeRigId: "local",
      editorDirty: true,
      rigs: [{ id: "remote", name: "Remote", root: "/remote" }],
    });
    expect(deps.rigs.listeners.size).toBe(1);
    const setInputSlot = result.current.palette.setInputSlot;

    act(() => {
      deps.commandPalette.set({
        ...deps.commandPalette.value,
        revision: 2,
        open: true,
      });
    });
    expect(result.current.palette.setInputSlot).toBe(setInputSlot);

    act(() => {
      result.current.selectTab(2);
      result.current.newPrivateTab();
      result.current.toggleAgentsView();
      result.current.activateAgent(2, 7);
      result.current.palette.show();
    });

    expect(deps.tabs.transition).toHaveBeenCalledWith({ focusedPane: "right" });
    expect(deps.terminalSessions.open).toHaveBeenCalledWith({ private: true });
    expect(deps.settingsView.close).toHaveBeenCalledOnce();
    expect(deps.agentsView.show).toHaveBeenCalledOnce();
    expect(deps.rigs.activate).toHaveBeenCalledWith("remote");
    expect(deps.terminalSessions.focus).toHaveBeenCalledWith(7);
    expect(deps.commandPalette.show).toHaveBeenCalledWith("commands");

    unmount();
    expect(deps.rigs.listeners.size).toBe(0);
  });
});

describe("current LegacyWorkspace parity", () => {
  it("threads tab actions to their owners", () => {
    const deps = capabilities();
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => {
      result.current.closeTab(2);
      result.current.pinTab(2);
      result.current.renameTab(2, "renamed");
      result.current.reorderTab(2, 0);
      result.current.toggleSidebar();
      result.current.overrideLanguage(2, "tsx");
    });

    expect(deps.values.tabActions.close).toHaveBeenCalledWith(2);
    expect(deps.values.editorNavigation.pin).toHaveBeenCalledWith(2);
    expect(deps.values.tabActions.rename).toHaveBeenCalledWith(2, "renamed");
    expect(deps.tabs.reorderByGap).toHaveBeenCalledWith(2, 0);
    expect(deps.values.sidebarNavigation.toggle).toHaveBeenCalledOnce();
    expect(deps.values.editorNavigation.setLanguage).toHaveBeenCalledWith(
      2,
      "tsx",
    );
    unmount();
  });

  it("selecting a third tab while focused right loads it into the right pane", () => {
    const deps = capabilities();
    deps.tabs.value = {
      ...deps.tabs.value,
      activeId: 1,
      splitTabId: 2,
      focusedPane: "right",
    };
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => result.current.selectTab(3));

    expect(deps.tabs.transition).toHaveBeenCalledWith({ splitTabId: 3 });
    unmount();
  });

  it("selecting a third tab while focused left activates it in the left pane", () => {
    const deps = capabilities();
    deps.tabs.value = {
      ...deps.tabs.value,
      activeId: 1,
      splitTabId: 2,
      focusedPane: "left",
    };
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => result.current.selectTab(3));

    expect(deps.tabs.transition).toHaveBeenCalledWith({
      activeId: 3,
      focusedPane: "left",
    });
    unmount();
  });

  it("clicking the tab already shown in a pane just moves focus, not content", () => {
    const deps = capabilities();
    deps.tabs.value = {
      ...deps.tabs.value,
      activeId: 1,
      splitTabId: 2,
      focusedPane: "left",
    };
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => {
      result.current.selectTab(2);
      result.current.selectTab(1);
    });

    expect(deps.tabs.transition.mock.calls).toEqual([
      [{ focusedPane: "right" }],
      [{ focusedPane: "left" }],
    ]);
    unmount();
  });

  it("opens a preview tab from the header host", () => {
    const deps = capabilities();
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => result.current.newPreviewTab());

    expect(deps.values.browserTabs.open).toHaveBeenCalledWith("");
    unmount();
  });

  it("opens the new editor dialog from the header host", () => {
    const deps = capabilities();
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => result.current.newEditor());

    expect(deps.values.editorNavigation.openNewFile).toHaveBeenCalledOnce();
    unmount();
  });

  it("removes the header host when the App unmounts", () => {
    const deps = capabilities();
    const { unmount } = renderHook(() => useHeaderRuntime(deps.values));
    expect(deps.presentation.listeners.size).toBe(1);
    expect(deps.rigs.listeners.size).toBe(1);

    unmount();

    expect(deps.presentation.listeners.size).toBe(0);
    expect(deps.rigs.listeners.size).toBe(0);
  });

  it("delegates rig management to the rig actions", () => {
    const deps = capabilities();
    const { result, unmount } = renderHook(() =>
      useHeaderRuntime(deps.values),
    );

    act(() => {
      result.current.newRig();
      result.current.newSshRig("ssh-1");
      result.current.deleteRig("remote");
      result.current.jumpToTab(2);
      result.current.moveTabToRig(2, "remote");
      result.current.reorderRigTab(2, 2, "top");
      result.current.newTabInRig("remote");
    });

    expect(deps.values.rigWorkflows.createLocal).toHaveBeenCalledOnce();
    expect(deps.values.rigWorkflows.createSsh).toHaveBeenCalledWith("ssh-1");
    expect(deps.values.rigWorkflows.remove).toHaveBeenCalledWith("remote");
    expect(deps.rigs.activate).toHaveBeenCalledWith("remote");
    expect(deps.tabs.moveToRig).toHaveBeenCalledWith(2, "remote");
    expect(deps.tabs.reorderAcrossRigs).toHaveBeenCalledWith(2, 2, "top");
    expect(deps.terminalSessions.open).toHaveBeenCalledWith({
      cwd: "/remote",
      rigId: "remote",
    });
    unmount();
  });
});
