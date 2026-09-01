import type { EditorSessionsCapability } from "@termco/editor-base";
import type {
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureEditorNavigation,
  editorNavigation,
  newFileOpen,
  setNewFileOpen,
  subscribeNewFile,
} from "./newFile";

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
  const sessions = {
    whenReady: vi.fn(async () => {}),
    gotoLine: vi.fn(() => true),
  } as unknown as EditorSessionsCapability;
  return { tabs, sessions, snapshot: () => snapshot };
}

let dispose = () => {};

beforeEach(() => setNewFileOpen(false));
afterEach(() => dispose());

describe("editor-owned new-file workflow", () => {
  it("opens through the public capability and publishes only real changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNewFile(listener);

    editorNavigation.openNewFile();
    expect(newFileOpen()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    editorNavigation.openNewFile();
    expect(listener).toHaveBeenCalledTimes(1);
    setNewFileOpen(false);
    expect(newFileOpen()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});

describe("editor-owned tab navigation", () => {
  it("opens the exact pinned editor payload in the selected rig", () => {
    const runtime = tabRuntime();
    dispose = configureEditorNavigation(runtime.tabs, runtime.sessions);

    expect(editorNavigation.openFile("/repo/src/app.ts")).toBe(2);
    expect(runtime.snapshot()).toMatchObject({ activeId: 2 });
    expect(runtime.snapshot().tabs.at(-1)).toEqual({
      id: 2,
      rigId: "remote",
      kind: "editor",
      title: "app.ts",
      data: { path: "/repo/src/app.ts", dirty: false, preview: false },
    });
  });

  it("reuses one preview slot and promotes it in place", () => {
    const runtime = tabRuntime();
    dispose = configureEditorNavigation(runtime.tabs, runtime.sessions);

    const first = editorNavigation.openFile("/repo/one.ts", false);
    const second = editorNavigation.openFile("/repo/two.ts", false);
    expect(second).not.toBe(first);
    expect(
      runtime.snapshot().tabs.filter((tab) => tab.kind === "editor"),
    ).toHaveLength(1);
    expect(runtime.snapshot().tabs.at(-1)?.data).toMatchObject({
      path: "/repo/two.ts",
      preview: true,
    });

    expect(editorNavigation.openFile("/repo/two.ts", true)).toBe(second);
    expect(runtime.snapshot().tabs.at(-1)?.data?.preview).toBe(false);
  });

  it("owns header pinning and language overrides", () => {
    const runtime = tabRuntime();
    dispose = configureEditorNavigation(runtime.tabs, runtime.sessions);
    const id = editorNavigation.openFile("/repo/app.ts", false);

    expect(editorNavigation.pin(id)).toBe(true);
    expect(editorNavigation.setLanguage(id, "tsx")).toBe(true);
    expect(runtime.snapshot().tabs.at(-1)?.data).toMatchObject({
      preview: false,
      overrideLanguage: "tsx",
    });
    expect(editorNavigation.pin(999)).toBe(false);
  });

  it("waits for the source-owned session before jumping to a line", async () => {
    const runtime = tabRuntime();
    let ready = () => {};
    vi.mocked(runtime.sessions.whenReady).mockImplementationOnce(
      () => new Promise<void>((resolve) => (ready = resolve)),
    );
    dispose = configureEditorNavigation(runtime.tabs, runtime.sessions);

    const id = editorNavigation.openFileAt("/repo/app.ts", 12);
    expect(runtime.sessions.whenReady).toHaveBeenCalledWith(id);
    expect(runtime.sessions.gotoLine).not.toHaveBeenCalled();
    ready();
    await Promise.resolve();
    expect(runtime.sessions.gotoLine).toHaveBeenCalledWith(id, 12);
  });

  it("retargets open editor paths when a file or directory is renamed", () => {
    const runtime = tabRuntime();
    dispose = configureEditorNavigation(runtime.tabs, runtime.sessions);
    const first = editorNavigation.openFile("/repo/src/one.ts");
    const second = editorNavigation.openFile("/elsewhere/two.ts");

    expect(editorNavigation.retargetPath("/repo", "/renamed")).toBe(1);
    expect(runtime.snapshot().tabs.find((tab) => tab.id === first)).toMatchObject({
      title: "one.ts",
      data: { path: "/renamed/src/one.ts" },
    });
    expect(runtime.snapshot().tabs.find((tab) => tab.id === second)).toMatchObject({
      data: { path: "/elsewhere/two.ts" },
    });
  });
});
