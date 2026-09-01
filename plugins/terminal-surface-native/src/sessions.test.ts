import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTerminalSessions,
  configureTerminalSessions,
  terminalSessions,
} from "./sessions";

const runtime = vi.hoisted(() => ({
  clearFocusedTerminal: vi.fn(() => true),
  disposeSession: vi.fn(),
  leafIdForPty: vi.fn(() => null),
  leafHasForegroundProcess: vi.fn(async (leafId: number) => leafId === 42),
  navigateFocusedBlocks: vi.fn(() => true),
  whenSessionReady: vi.fn(async () => {}),
  writeToSession: vi.fn(() => true),
}));

vi.mock("./terminal/lib/useTerminalSession", () => runtime);

let disposeTabs = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  clearTerminalSessions();
});

afterEach(() => disposeTabs());

function tabs(over?: {
  splitTabId?: number;
  focusedPane?: "left" | "right";
  records?: Array<{
    id: number;
    rigId: string;
    kind: string;
    title: string;
    data: Record<string, unknown>;
  }>;
}) {
  let nextId = 10;
  const transition = vi.fn();
  const provider = {
    snapshot: () => ({
      revision: 1,
      initialized: true,
      tabs: over?.records ?? [
        { id: 1, rigId: "rig-a", kind: "editor", title: "a.ts", data: {} },
        { id: 2, rigId: "rig-a", kind: "preview", title: "Preview", data: {} },
      ],
      activeId: 1,
      splitTabId: over?.splitTabId ?? 0,
      focusedPane: over?.focusedPane ?? "left",
      booted: true,
      activeRigIdForNewTabs: "rig-a",
    }),
    allocate: (count = 1) =>
      Array.from({ length: count }, () => nextId++),
    transition,
  } as unknown as WorkspaceTabsCapability;
  disposeTabs = configureTerminalSessions(provider);
  return { transition };
}

describe("terminal.sessions", () => {
  it("opens a terminal tab in the active rig with the exact payload", () => {
    const provider = tabs();

    expect(
      terminalSessions.open({ cwd: "/repo", blocks: true }),
    ).toEqual({ tabId: 10, leafId: 11 });
    expect(provider.transition).toHaveBeenCalledWith({
      tabs: [
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
        {
          id: 10,
          rigId: "rig-a",
          kind: "terminal",
          title: "blocks",
          data: {
            cwd: "/repo",
            paneTree: { kind: "leaf", id: 11, cwd: "/repo" },
            activeLeafId: 11,
            blocks: true,
          },
        },
      ],
      activeId: 10,
    });
  });

  it("replaces the right split while preserving the left active tab", () => {
    const provider = tabs({ splitTabId: 2, focusedPane: "right" });

    terminalSessions.open({ private: true });

    expect(provider.transition).toHaveBeenCalledWith({
      tabs: expect.arrayContaining([
        expect.objectContaining({ id: 10, title: "private" }),
      ]),
      splitTabId: 10,
    });
  });

  it("disposes the plugin-owned runtime and drops its mounted handle", () => {
    const handle = {
      write: vi.fn(),
      focus: vi.fn(),
      getBuffer: vi.fn(() => ""),
      getSelection: vi.fn(() => null),
    };
    terminalSessions.register(42, handle);

    terminalSessions.dispose(42);

    expect(runtime.disposeSession).toHaveBeenCalledWith(42);
    expect(terminalSessions.handle(42)).toBeNull();
    expect(terminalSessions.leafIds()).not.toContain(42);
  });

  it("owns foreground inspection and focused terminal actions", async () => {
    terminalSessions.register(41, {
      write: vi.fn(),
      focus: vi.fn(),
      getBuffer: vi.fn(() => ""),
      getSelection: vi.fn(() => null),
    });
    terminalSessions.register(42, {
      write: vi.fn(),
      focus: vi.fn(),
      getBuffer: vi.fn(() => ""),
      getSelection: vi.fn(() => null),
    });

    await expect(terminalSessions.hasForegroundProcesses()).resolves.toBe(true);
    expect(runtime.leafHasForegroundProcess).toHaveBeenCalledWith(41);
    expect(runtime.leafHasForegroundProcess).toHaveBeenCalledWith(42);
    expect(terminalSessions.clearFocused()).toBe(true);
    expect(runtime.clearFocusedTerminal).toHaveBeenCalledOnce();
    expect(terminalSessions.navigateFocusedBlocks(-1)).toBe(true);
    expect(runtime.navigateFocusedBlocks).toHaveBeenCalledWith(-1);
  });

  it("resets the workspace to one terminal and disposes every old terminal pane", () => {
    const provider = tabs({
      splitTabId: 2,
      focusedPane: "right",
      records: [
        {
          id: 1,
          rigId: "rig-a",
          kind: "terminal",
          title: "shell",
          data: {
            paneTree: {
              kind: "split",
              id: 40,
              dir: "row",
              children: [
                { kind: "leaf", id: 41 },
                { kind: "leaf", id: 42 },
              ],
            },
            activeLeafId: 42,
          },
        },
        { id: 2, rigId: "rig-a", kind: "editor", title: "a.ts", data: {} },
      ],
    });

    expect(terminalSessions.reset({ cwd: "/new-home" })).toEqual({
      tabId: 10,
      leafId: 11,
    });
    expect(provider.transition).toHaveBeenCalledWith({
      tabs: [
        {
          id: 10,
          rigId: "rig-a",
          kind: "terminal",
          title: "shell",
          data: {
            cwd: "/new-home",
            paneTree: { kind: "leaf", id: 11, cwd: "/new-home" },
            activeLeafId: 11,
          },
        },
      ],
      activeId: 10,
      splitTabId: 0,
      focusedPane: "left",
    });
    expect(runtime.disposeSession).toHaveBeenCalledWith(41);
    expect(runtime.disposeSession).toHaveBeenCalledWith(42);
  });
});

describe("current LegacyWorkspace parity", () => {
  it("a new tab opened while focused right lands in the right pane", () => {
    const provider = tabs({ splitTabId: 2, focusedPane: "right" });

    terminalSessions.open();

    expect(provider.transition).toHaveBeenCalledWith({
      tabs: expect.arrayContaining([expect.objectContaining({ id: 10 })]),
      splitTabId: 10,
    });
  });

  it("focuses a terminal leaf through legacy actions", () => {
    const focus = vi.fn();
    terminalSessions.register(42, {
      write: vi.fn(),
      focus,
      getBuffer: vi.fn(() => ""),
      getSelection: vi.fn(() => null),
    });

    expect(terminalSessions.focus(42)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });
});
