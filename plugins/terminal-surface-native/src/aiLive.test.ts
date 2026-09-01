import { describe, expect, it, vi } from "vitest";
import type { AiLiveCapability, AiLiveContributionCapability } from "@termco/ai-live-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import { contributeTerminalAiLive } from "./aiLive";

describe("terminal AI live contribution", () => {
  it("reads the requested rig's shared terminal and redacts secrets", () => {
    const captured: { value?: Partial<AiLiveCapability> } = {};
    const dispose = vi.fn();
    const contributions = {
      contribute(value: Partial<AiLiveCapability>) {
        captured.value = value;
        return dispose;
      },
    } as unknown as AiLiveContributionCapability;
    const tabs = {
      snapshot: () => ({
        activeId: 1,
        activeTabByRig: { local: 1, remote: 2 },
        tabs: [
          {
            id: 1,
            rigId: "local",
            kind: "terminal",
            title: "local",
            data: { activeLeafId: 11 },
          },
          {
            id: 2,
            rigId: "remote",
            kind: "terminal",
            title: "remote",
            data: { activeLeafId: 22 },
          },
        ],
      }),
    } as unknown as WorkspaceTabsCapability;
    const sessions = {
      buffer: vi.fn((leafId: number) =>
        leafId === 22
          ? "API_KEY=super-secret-value-that-must-not-leak"
          : "local",
      ),
    } as unknown as TerminalSessionsCapability;

    const returned = contributeTerminalAiLive(
      contributions,
      { getCwd: () => "/srv" } as unknown as AiLiveCapability,
      tabs,
      sessions,
    );

    expect(captured.value?.getTerminalContext?.("remote")).toBe(
      "API_KEY=<REDACTED>",
    );
    expect(sessions.buffer).toHaveBeenCalledWith(22, 300);
    returned();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("withholds private terminal content", () => {
    const captured: { value?: Partial<AiLiveCapability> } = {};
    const tabs = {
      snapshot: () => ({
        activeId: 1,
        activeTabByRig: { private: 1 },
        tabs: [
          {
            id: 1,
            rigId: "private",
            kind: "terminal",
            title: "private",
            data: { activeLeafId: 11, private: true },
          },
        ],
      }),
    } as unknown as WorkspaceTabsCapability;
    const sessions = {
      buffer: vi.fn(() => "secret"),
    } as unknown as TerminalSessionsCapability;

    contributeTerminalAiLive(
      {
        contribute(value: Partial<AiLiveCapability>) {
          captured.value = value;
          return () => {};
        },
      } as unknown as AiLiveContributionCapability,
      { getCwd: () => null } as unknown as AiLiveCapability,
      tabs,
      sessions,
    );

    expect(captured.value?.getTerminalContext?.("private")).toBeNull();
    expect(captured.value?.isActiveTerminalPrivate?.("private")).toBe(true);
    expect(sessions.buffer).not.toHaveBeenCalled();
  });
});
