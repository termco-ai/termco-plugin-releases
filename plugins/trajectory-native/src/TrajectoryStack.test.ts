import type { WorkspaceTabRecord, WorkspaceTabsCapability } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { openTrajectoryTab } from "./TrajectoryStack";

function tabsProvider(initial: readonly WorkspaceTabRecord[] = []) {
  let tabs = [...initial];
  let activeId = tabs[0]?.id ?? 0;
  const transition = vi.fn((next: { tabs?: readonly WorkspaceTabRecord[]; activeId?: number }) => {
    if (next.tabs) tabs = [...next.tabs];
    if (next.activeId !== undefined) activeId = next.activeId;
  });
  const capability = {
    snapshot: () => ({
      revision: 1,
      initialized: true,
      tabs,
      activeId,
      splitTabId: 0,
      focusedPane: "left" as const,
      booted: true,
      activeRigIdForNewTabs: "rig-a",
      activeTabByRig: {},
    }),
    allocate: () => [42],
    transition,
  } as unknown as WorkspaceTabsCapability;
  return { capability, transition };
}

describe("openTrajectoryTab", () => {
  it("opens a current-format trajectory tab through workspace.tabs", () => {
    const tabs = tabsProvider();

    openTrajectoryTab(tabs.capability, "session-1", 7, "record-7");

    expect(tabs.transition).toHaveBeenCalledWith({
      tabs: [
        {
          id: 42,
          rigId: "rig-a",
          kind: "trajectory",
          title: "Trajectory · session-1",
          data: { sessionId: "session-1", eventSeq: 7, recordId: "record-7" },
        },
      ],
      activeId: 42,
    });
  });

  it("selects an existing session tab instead of duplicating it", () => {
    const existing: WorkspaceTabRecord = {
      id: 9,
      rigId: "rig-a",
      kind: "trajectory",
      title: "Trajectory · session-1",
      data: { sessionId: "session-1" },
    };
    const tabs = tabsProvider([existing]);

    openTrajectoryTab(tabs.capability, "session-1");

    expect(tabs.transition).toHaveBeenCalledWith({ activeId: 9 });
  });
});
