import type { AgentActivityControlCapability } from "@termco/agents-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { installTerminalActivity } from "./renderer";

describe("terminal agent activity adapter", () => {
  it("normalizes PTY signals through public terminal and tab capabilities", () => {
    let emit: (payload: unknown) => void = () => {};
    const dispose = vi.fn();
    const events = {
      subscribe: vi.fn((_event, next) => {
        emit = next;
        return dispose;
      }),
    } as unknown as ApplicationEventsCapability;
    const transition = vi.fn();
    const tabs = {
      snapshot: () => ({
        activeId: 12,
        tabs: [
          {
            id: 12,
            rigId: "rig-a",
            kind: "terminal",
            title: "shell",
            data: { paneTree: { kind: "leaf", id: 7 } },
          },
        ],
      }),
      transition,
    } as unknown as WorkspaceTabsCapability;
    const focus = vi.fn();
    const terminals = {
      leafForPty: (ptyId: number) => (ptyId === 44 ? 7 : null),
      focus,
    } as unknown as TerminalSessionsCapability;
    const terminalSignal = vi.fn();
    const activity = {
      terminalSignal,
    } as unknown as AgentActivityControlCapability;

    expect(
      installTerminalActivity({ activity, events, tabs, terminals }),
    ).toBe(dispose);
    emit({ id: 99, kind: "started", agent: "codex" });
    expect(terminalSignal).not.toHaveBeenCalled();

    emit({ id: 44, kind: "started", agent: "codex" });
    expect(terminalSignal).toHaveBeenLastCalledWith({
      kind: "started",
      leafId: 7,
      tabId: 12,
      agent: "codex",
    });

    emit({ id: 44, kind: "attention", agent: "codex" });
    expect(terminalSignal).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "attention",
        leafId: 7,
        body: "shell",
        visible: true,
        activate: expect.any(Function),
      }),
    );
    terminalSignal.mock.calls.at(-1)?.[0].activate();
    expect(transition).toHaveBeenCalledWith({ activeId: 12 });
    expect(focus).toHaveBeenCalledWith(7);

    emit({ id: 44, kind: "exited", agent: null });
    expect(terminalSignal).toHaveBeenLastCalledWith({
      kind: "exited",
      leafId: 7,
    });
  });

  it("finds a terminal inside the canonical multi-pane workspace tree", () => {
    let emit: (payload: unknown) => void = () => {};
    const events = {
      subscribe: vi.fn((_event, next) => {
        emit = next;
        return vi.fn();
      }),
    } as unknown as ApplicationEventsCapability;
    const tabs = {
      snapshot: () => ({
        activeId: 12,
        tabs: [
          {
            id: 12,
            rigId: "rig-a",
            kind: "terminal",
            title: "split shell",
            data: {
              paneTree: {
                kind: "split",
                id: 20,
                dir: "row",
                children: [
                  { kind: "leaf", id: 7 },
                  { kind: "leaf", id: 8 },
                ],
              },
            },
          },
        ],
      }),
      transition: vi.fn(),
    } as unknown as WorkspaceTabsCapability;
    const terminals = {
      leafForPty: () => 8,
      focus: vi.fn(),
    } as unknown as TerminalSessionsCapability;
    const terminalSignal = vi.fn();

    installTerminalActivity({
      activity: { terminalSignal } as unknown as AgentActivityControlCapability,
      events,
      tabs,
      terminals,
    });
    emit({ id: 44, kind: "started", agent: "codex" });

    expect(terminalSignal).toHaveBeenCalledWith({
      kind: "started",
      leafId: 8,
      tabId: 12,
      agent: "codex",
    });
  });
});
