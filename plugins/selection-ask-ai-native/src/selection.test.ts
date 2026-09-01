import { describe, expect, it, vi } from "vitest";
import type { EditorSessionsCapability } from "@termco/editor-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { captureActiveSelection } from "./selection";

describe("Ask AI selection capture", () => {
  it("delegates to the legacy actions service", () => {
    const tabs = {
      snapshot: () => ({
        focusedPane: "left",
        activeId: 1,
        splitTabId: 0,
        tabs: [
          {
            id: 1,
            rigId: "local",
            kind: "terminal",
            title: "shell",
            data: { activeLeafId: 7 },
          },
        ],
      }),
    } as unknown as WorkspaceTabsCapability;
    const terminals = {
      selection: vi.fn(() => "selected output"),
    } as unknown as TerminalSessionsCapability;
    expect(
      captureActiveSelection(
        tabs,
        terminals,
        { selection: vi.fn() } as unknown as EditorSessionsCapability,
      ),
    ).toEqual({ text: "selected output", source: "terminal" });
    expect(terminals.selection).toHaveBeenCalledWith(7);
  });

  it("returns null while the legacy App is not mounted", () => {
    const tabs = {
      snapshot: () => ({
        focusedPane: "left",
        activeId: 0,
        splitTabId: 0,
        tabs: [],
      }),
    } as unknown as WorkspaceTabsCapability;
    expect(
      captureActiveSelection(
        tabs,
        { selection: vi.fn() } as unknown as TerminalSessionsCapability,
        { selection: vi.fn() } as unknown as EditorSessionsCapability,
      ),
    ).toBeNull();
  });

  it("reads only the terminal in the focused split pane", () => {
    const tabs = {
      snapshot: () => ({
        focusedPane: "right",
        splitTabId: 2,
        activeId: 1,
        tabs: [
          { id: 1, rigId: "local", kind: "editor", title: "a.ts" },
          {
            id: 2,
            rigId: "remote",
            kind: "terminal",
            title: "shell",
            data: { activeLeafId: 3 },
          },
        ],
      }),
    } as unknown as WorkspaceTabsCapability;
    const terminals = {
      selection: vi.fn(() => "remote output"),
    } as unknown as TerminalSessionsCapability;
    const editors = {
      selection: vi.fn(() => "local code"),
    } as unknown as EditorSessionsCapability;

    expect(captureActiveSelection(tabs, terminals, editors)).toEqual({
      text: "remote output",
      source: "terminal",
    });
    expect(terminals.selection).toHaveBeenCalledWith(3);
    expect(editors.selection).not.toHaveBeenCalled();
  });

  it("suppresses empty selections", () => {
    const tabs = {
      snapshot: () => ({
        focusedPane: "left",
        splitTabId: 0,
        activeId: 1,
        tabs: [{ id: 1, rigId: "local", kind: "editor", title: "a.ts" }],
      }),
    } as unknown as WorkspaceTabsCapability;
    expect(
      captureActiveSelection(
        tabs,
        { selection: () => null } as unknown as TerminalSessionsCapability,
        { selection: () => "  " } as unknown as EditorSessionsCapability,
      ),
    ).toBeNull();
  });
});
