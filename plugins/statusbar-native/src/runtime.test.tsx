import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StatusbarRuntimeCapabilities } from "./runtime";
import { useStatusbarRuntime } from "./runtime";

class BoundStore<T> {
  readonly listeners = new Set<() => void>();

  constructor(readonly value: T) {}

  snapshot(): T {
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

describe("source-owned status-bar runtime", () => {
  it("uses the focused rig tab and shared providers for every action", () => {
    const presentation = new BoundStore({
      revision: 1,
      header: {
        tabs: [],
        allTabs: [],
        activeTabId: 4,
        agentsViewOpen: false,
        editorDirty: false,
        findTarget: null,
      },
      sidebar: {
        rootPath: "/work",
        workspace: { kind: "local" as const },
        activeFilePath: null,
      },
      context: {
        cwd: "/work/a b",
        filePath: "/work/a b/file.ts",
        home: "/Users/test",
        privateActive: true,
        zenMode: false,
      },
    });
    const environment = Object.assign(
      new BoundStore({
        workspace: { kind: "local" as const },
        home: "/Users/test",
        launchCwd: "/work",
        launchCwdResolved: true,
        wslDistros: [],
        wslLoading: false,
        wslError: null,
      }),
      {
        switch: vi.fn(async () => true),
        refreshWslDistros: vi.fn(async () => []),
      },
    );
    const tabs = new BoundStore({
      revision: 1,
      initialized: true,
      tabs: [
        {
          id: 4,
          rigId: "local",
          kind: "terminal",
          title: "Terminal",
          data: { activeLeafId: 9 },
        },
      ],
      activeId: 4,
      splitTabId: 0,
      focusedPane: "left" as const,
      booted: true,
      activeRigIdForNewTabs: "local",
      activeTabByRig: { local: 4 },
    });
    const aiSessions = Object.assign(
      new BoundStore({
        revision: 1,
        panelOpen: false,
        miniOpen: true,
        selectedModelId: "model",
        activeSessionId: null,
        agent: {
          status: "streaming" as const,
          step: "Calling tool",
          error: null,
        },
      }),
      { openPanel: vi.fn() },
    );
    const settingsView = { show: vi.fn() };
    const terminalSessions = { write: vi.fn(() => true), focus: vi.fn() };
    const capabilities = {
      aiSessions,
      environment,
      presentation,
      settingsView,
      tabs,
      terminalSessions,
    } as unknown as StatusbarRuntimeCapabilities;

    const { result, unmount } = renderHook(() =>
      useStatusbarRuntime(capabilities),
    );
    expect(result.current).toMatchObject({
      cwd: "/work/a b",
      filePath: "/work/a b/file.ts",
      privateActive: true,
      aiSurfaceOpen: true,
      ai: { status: "streaming", step: "Calling tool" },
    });
    expect(tabs.listeners.size).toBe(1);

    act(() => {
      result.current.sendCd("/work/a b");
      result.current.openLanguagesSettings();
      result.current.openAi();
      result.current.changeWorkspace({ kind: "local" });
    });

    expect(terminalSessions.write).toHaveBeenCalledWith(
      9,
      "cd '/work/a b'\r",
    );
    expect(terminalSessions.focus).toHaveBeenCalledWith(9);
    expect(settingsView.show).toHaveBeenCalledWith("languages");
    expect(aiSessions.openPanel).toHaveBeenCalledOnce();
    expect(environment.switch).toHaveBeenCalledWith({ kind: "local" });

    unmount();
    expect(tabs.listeners.size).toBe(0);
  });
});
