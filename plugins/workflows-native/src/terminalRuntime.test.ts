import { describe, expect, it, vi } from "vitest";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { createWorkflowTerminalActions } from "./renderer";

function terminals() {
  return {
    open: vi.fn(() => ({ tabId: 30, leafId: 31 })),
    whenReady: vi.fn(async () => {}),
    write: vi.fn(() => true),
    focus: vi.fn(() => true),
  };
}

describe("workflow terminal runtime", () => {
  it("runs in the terminal belonging to the focused split pane", async () => {
    const terminal = terminals();
    const tabs = {
      snapshot: () => ({
        focusedPane: "right",
        splitTabId: 20,
        activeId: 10,
        tabs: [
          { id: 10, rigId: "local", kind: "editor", title: "a.ts" },
          {
            id: 20,
            rigId: "remote",
            kind: "terminal",
            title: "shell",
            data: { activeLeafId: 21 },
          },
        ],
      }),
    } as unknown as WorkspaceTabsCapability;

    await createWorkflowTerminalActions(
      tabs,
      terminal as unknown as TerminalSessionsCapability,
    ).runInFocusedTerminal("pnpm test");

    expect(terminal.open).not.toHaveBeenCalled();
    expect(terminal.write).toHaveBeenCalledWith(21, "pnpm test\r");
    expect(terminal.focus).toHaveBeenCalledWith(21);
  });

  it("opens one shared terminal and waits for readiness when none is focused", async () => {
    const terminal = terminals();
    const tabs = {
      snapshot: () => ({
        focusedPane: "left",
        splitTabId: 0,
        activeId: 10,
        tabs: [{ id: 10, rigId: "local", kind: "editor", title: "a.ts" }],
      }),
    } as unknown as WorkspaceTabsCapability;

    await createWorkflowTerminalActions(
      tabs,
      terminal as unknown as TerminalSessionsCapability,
    ).runInFocusedTerminal("git status");

    expect(terminal.open).toHaveBeenCalledWith({ cwd: undefined });
    expect(terminal.whenReady).toHaveBeenCalledWith(31);
    expect(terminal.write).toHaveBeenCalledWith(31, "git status\r");
    expect(terminal.focus).toHaveBeenCalledWith(31);
  });
});
