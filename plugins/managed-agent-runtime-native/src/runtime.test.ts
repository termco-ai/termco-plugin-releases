import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentActivityEvent } from "@termco/agents-base";
import type { AiLiveCapability } from "@termco/ai-live-base";
import {
  installManagedAgentRuntime,
  type ManagedAgentRuntimeDependencies,
} from "./runtime";

afterEach(() => {
  vi.useRealTimers();
});

describe("managed agent runtime plugin", () => {
  it("spawns through shared terminal/hooks state and reviews activity", async () => {
    vi.useFakeTimers();
    let activityListener: (event: AgentActivityEvent) => void = () => {};
    let sessionListener: () => void = () => {};
    let liveContribution: Partial<AiLiveCapability> = {};
    const disposeActivity = vi.fn();
    const disposeSessions = vi.fn();
    const disposeLive = vi.fn();
    const sendMessage = vi.fn(async () => {});
    const write = vi.fn(() => true);
    const open = vi.fn(() => ({ tabId: 3, leafId: 7 }));
    const enable = vi.fn();
    const dependencies = {
      activity: {
        subscribeEvents(listener: (event: AgentActivityEvent) => void) {
          activityListener = listener;
          return disposeActivity;
        },
      },
      hooks: { enable },
      sessions: {
        snapshot: () => ({ activeSessionId: "session-a" }),
        subscribe(listener: () => void) {
          sessionListener = listener;
          return disposeSessions;
        },
        sessionContext: () => ({ rigId: "rig-a" }),
        sendMessage,
      },
      terminals: {
        open,
        whenReady: vi.fn(async () => {}),
        write,
        buffer: vi.fn(() => "? for shortcuts"),
      },
    } as unknown as ManagedAgentRuntimeDependencies;

    const dispose = installManagedAgentRuntime(dependencies);
    dispose.bindLive(
      { getCwd: vi.fn(() => "/work") } as unknown as AiLiveCapability,
      {
        register(contribution: Partial<AiLiveCapability>) {
          liveContribution = contribution;
          return disposeLive;
        },
        snapshot: () => [liveContribution],
      },
    );
    expect(liveContribution.spawnManagedAgent?.("  implement\nthis  ", "session-a"))
      .toEqual({ tabId: 3, leafId: 7 });
    await vi.runAllTimersAsync();

    expect(open).toHaveBeenCalledWith({
      cwd: "/work",
      title: "claude · implement this",
    });
    expect(enable).toHaveBeenCalledWith("claude");
    expect(write).toHaveBeenNthCalledWith(1, 7, "claude\r");
    expect(write).toHaveBeenNthCalledWith(
      2,
      7,
      "\x1b[200~implement\nthis\x1b[201~",
    );
    expect(write).toHaveBeenNthCalledWith(3, 7, "\r");
    expect(liveContribution.getManagedAgent?.("session-a")).toMatchObject({
      leafId: 7,
      phase: "working",
      rounds: 0,
    });
    expect(liveContribution.readManagedAgentOutput?.("session-a")).toBe(
      "? for shortcuts",
    );
    await expect(
      liveContribution.sendManagedAgentInstruction?.("session-a", "continue"),
    ).resolves.toEqual({ ok: true, round: 1 });
    await vi.runAllTimersAsync();
    expect(write).toHaveBeenNthCalledWith(4, 7, "\x1b[200~continue\x1b[201~");
    expect(write).toHaveBeenNthCalledWith(5, 7, "\r");

    activityListener({ kind: "finished", leafId: 7 });
    expect(sendMessage).toHaveBeenCalledWith(
      "session-a",
      expect.stringContaining("implement this"),
    );
    sessionListener();

    dispose();
    expect(disposeLive).toHaveBeenCalledOnce();
    expect(disposeSessions).toHaveBeenCalledOnce();
    expect(disposeActivity).toHaveBeenCalledOnce();
  });
});
