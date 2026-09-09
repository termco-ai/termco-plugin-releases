import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceTabCloseGuardContribution,
  WorkspaceTabCloseGuardRegistry,
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceTabActions } from "./actions";

function setup(
  initialTabs: WorkspaceTabRecord[],
  guards: WorkspaceTabCloseGuardContribution[] = [],
) {
  let snapshot: WorkspaceTabsSnapshot = {
    revision: 1,
    initialized: true,
    tabs: initialTabs,
    activeId: initialTabs[0]?.id ?? 0,
    splitTabId: 0,
    focusedPane: "left",
    booted: true,
    activeRigIdForNewTabs: "rig-a",
    activeTabByRig: {},
  };
  let nextId = 100;
  const tabs = {
    snapshot: () => snapshot,
    allocate: vi.fn((count = 1) =>
      Array.from({ length: count }, () => nextId++),
    ),
    transition: vi.fn((next) => {
      snapshot = {
        ...snapshot,
        ...next,
        revision: snapshot.revision + 1,
      };
    }),
    close: vi.fn((id: number) => {
      const exists = snapshot.tabs.some((tab) => tab.id === id);
      if (!exists) return false;
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        tabs: snapshot.tabs.filter((tab) => tab.id !== id),
        activeId: snapshot.activeId === id ? 0 : snapshot.activeId,
      };
      return true;
    }),
  } as unknown as WorkspaceTabsCapability;
  const terminalSessions = {
    dispose: vi.fn(),
  } as unknown as TerminalSessionsCapability;
  const actions = createWorkspaceTabActions({
    tabs,
    terminalSessions,
    guards: {
      snapshot: () => guards,
      register: () => () => {},
    } as WorkspaceTabCloseGuardRegistry,
  });
  return { actions, tabs, terminalSessions, readTabs: () => snapshot.tabs };
}

const terminal = (id: number, cwd = "/repo"): WorkspaceTabRecord => ({
  id,
  rigId: "rig-a",
  kind: "terminal",
  title: "shell",
  data: {
    cwd,
    paneTree: { kind: "leaf", id: id * 10, cwd },
    activeLeafId: id * 10,
  },
});

describe("workspace.tab-actions", () => {
  it.each([
    ["/repo/src/app.ts", "/repo/src"],
    ["/app.ts", "/"],
    ["C:\\repo\\app.ts", "C:\\repo"],
    ["C:\\app.ts", "C:\\"],
  ])("opens a terminal below %s in its directory without losing edits", (path, cwd) => {
    const file: WorkspaceTabRecord = { id: 2, rigId: "rig-a", kind: "editor",
      title: "app.ts", data: { path, dirty: true, preview: true, content: "unsaved" } };
    const s = setup([terminal(1), file]);
    s.tabs.transition({ activeId: 1, splitTabId: 2, focusedPane: "right" });
    vi.mocked(s.tabs.transition).mockClear();
    const id = s.actions.newTerminalBelow!(2);
    expect(s.tabs.transition).toHaveBeenCalledTimes(1);
    expect(s.tabs.snapshot()).toMatchObject({ activeId: 2, splitTabId: id,
      splitDirection: "vertical", focusedPane: "right" });
    expect(s.readTabs().find((tab) => tab.id === 2)?.data).toMatchObject({
      dirty: true, preview: false, content: "unsaved" });
    expect(s.readTabs().find((tab) => tab.id === id)).toMatchObject({
      kind: "terminal", rigId: "rig-a", data: { cwd, paneTree: { kind: "leaf", cwd } } });
    expect(s.terminalSessions.dispose).not.toHaveBeenCalled();
  });

  it("opens below Markdown and untitled files, and ignores missing or non-file anchors", () => {
    const s = setup([terminal(1), { id: 2, rigId: "rig-a", kind: "markdown", title: "README",
      data: { path: "/repo/README.md" } }, { id: 3, rigId: "rig-a", kind: "editor", title: "Untitled" }]);
    expect(s.actions.newTerminalBelow!(1)).toBeNull();
    expect(s.actions.newTerminalBelow!(999)).toBeNull();
    expect(s.tabs.allocate).not.toHaveBeenCalled();
    expect(s.actions.newTerminalBelow!(2)).not.toBeNull();
    const id = s.actions.newTerminalBelow!(3);
    expect(s.readTabs().find((tab) => tab.id === id)?.data?.cwd).toBeUndefined();
  });

  it("closes safe tabs and disposes every terminal leaf", async () => {
    const s = setup([
      {
        ...terminal(1),
        data: {
          paneTree: {
            kind: "split",
            first: { kind: "leaf", id: 10 },
            second: { kind: "leaf", id: 11 },
          },
        },
      },
    ]);

    await s.actions.close(1);

    expect(s.tabs.close).toHaveBeenCalledWith(1);
    expect(s.terminalSessions.dispose).toHaveBeenCalledWith(10);
    expect(s.terminalSessions.dispose).toHaveBeenCalledWith(11);
  });

  it("keeps a guarded tab open until the user confirms with exact plugin copy", async () => {
    const guard: WorkspaceTabCloseGuardContribution = {
      id: "editor",
      kinds: ["editor"],
      canClose: vi.fn(() => ({
        prompt: {
          title: "Unsaved Changes",
          body: '"notes.ts" has unsaved changes. Close anyway?',
          confirmLabel: "Close Anyway",
        },
      })),
    };
    const s = setup(
      [
        {
          id: 2,
          rigId: "rig-a",
          kind: "editor",
          title: "notes.ts",
          data: { path: "/repo/notes.ts", dirty: true },
        },
      ],
      [guard],
    );

    await s.actions.close(2);

    expect(s.tabs.close).not.toHaveBeenCalled();
    expect(s.actions.snapshot().pendingKindClose).toEqual({
      id: 2,
      prompt: {
        title: "Unsaved Changes",
        body: '"notes.ts" has unsaved changes. Close anyway?',
        confirmLabel: "Close Anyway",
      },
    });
    s.actions.confirmKindClose();
    expect(s.tabs.close).toHaveBeenCalledWith(2);
    expect(s.actions.snapshot().pendingKindClose).toBeNull();
  });

  it("bulk-closes safe tabs and collects all prompted tabs", async () => {
    const guard: WorkspaceTabCloseGuardContribution = {
      id: "editor",
      kinds: ["editor"],
      canClose: (tab) =>
        tab.data?.dirty
          ? { prompt: { title: "Unsaved", body: "Close?" } }
          : "close",
    };
    const s = setup(
      [
        terminal(1),
        {
          id: 2,
          rigId: "rig-a",
          kind: "editor",
          title: "dirty",
          data: { dirty: true },
        },
        {
          id: 3,
          rigId: "rig-a",
          kind: "editor",
          title: "clean",
          data: { dirty: false },
        },
        { ...terminal(4), rigId: "rig-b" },
      ],
      [guard],
    );

    await s.actions.closeMany(1, "others");

    expect(s.tabs.close).toHaveBeenCalledWith(3);
    expect(s.tabs.close).not.toHaveBeenCalledWith(4);
    expect(s.actions.snapshot().pendingBulkClose).toEqual([2]);
    s.actions.confirmBulkClose();
    expect(s.tabs.close).toHaveBeenCalledWith(2);
  });

  it("closes clean deleted editors and asks once for dirty descendants", () => {
    const s = setup([
      {
        id: 1,
        rigId: "rig-a",
        kind: "editor",
        title: "clean",
        data: { path: "/repo/src/a.ts", dirty: false },
      },
      {
        id: 2,
        rigId: "rig-a",
        kind: "editor",
        title: "dirty",
        data: { path: "/repo/src/b.ts", dirty: true },
      },
      {
        id: 3,
        rigId: "rig-a",
        kind: "editor",
        title: "other",
        data: { path: "/repo/other.ts", dirty: true },
      },
    ]);

    s.actions.pathDeleted("/repo/src");

    expect(s.tabs.close).toHaveBeenCalledWith(1);
    expect(s.tabs.close).not.toHaveBeenCalledWith(2);
    expect(s.actions.snapshot().pendingDeleteTabs).toEqual([2]);
  });

  it("opens a terminal to the right with the anchor cwd", () => {
    const s = setup([terminal(1), terminal(2, "/other")]);

    expect(s.actions.newRightOf(1)).toBe(100);
    expect(s.readTabs().map((tab) => tab.id)).toEqual([1, 100, 2]);
    expect(s.readTabs()[1]).toMatchObject({
      rigId: "rig-a",
      kind: "terminal",
      data: {
        cwd: "/repo",
        paneTree: { kind: "leaf", id: 101, cwd: "/repo" },
        activeLeafId: 101,
      },
    });
  });

  it("duplicates supported tab kinds and renames through opaque tab data", () => {
    const s = setup([
      {
        id: 1,
        rigId: "rig-a",
        kind: "editor",
        title: "file.ts",
        cold: true,
        data: { path: "/repo/file.ts", dirty: true, preview: true },
      },
    ]);

    expect(s.actions.duplicate(1)).toBe(100);
    expect(s.readTabs()[1]).toMatchObject({
      id: 100,
      cold: false,
      data: { path: "/repo/file.ts", dirty: true, preview: false },
    });
    s.actions.rename(100, "  Better title  ");
    expect(s.readTabs()[1].data?.customTitle).toBe("Better title");
  });
});
