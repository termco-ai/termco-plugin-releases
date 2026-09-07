import type { WorkspaceTabsCapability, WorkspaceTabsSnapshot } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { discardRestoredForgeReviewTabs, openForgeReviewTab } from "./tabs";

function tabs(snapshot: WorkspaceTabsSnapshot): WorkspaceTabsCapability {
  return {
    snapshot: () => snapshot,
    allocate: () => [50],
    transition: vi.fn(),
  } as unknown as WorkspaceTabsCapability;
}

describe("forge review tabs", () => {
  it("opens review tabs as non-restorable", () => {
    const workspaceTabs = tabs({
      revision: 1,
      initialized: true,
      tabs: [],
      activeId: 0,
      splitTabId: 0,
      focusedPane: "left",
      booted: true,
      activeRigIdForNewTabs: "local",
      activeTabByRig: {},
    });

    openForgeReviewTab(
      workspaceTabs,
      {
        host: "gitlab.example.com",
        slug: "group/app",
        reviewNoun: "merge request",
      } as never,
      { number: 42, title: "Review me" } as never,
    );

    expect(workspaceTabs.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        tabs: [expect.objectContaining({ restoreOnRestart: false })],
      }),
    );
  });

  it("discards legacy restored review tabs even if the shell already warmed them", () => {
    const workspaceTabs = tabs({
      revision: 1,
      initialized: true,
      tabs: [
        { id: 1, rigId: "local", kind: "terminal", title: "shell" },
        { id: 2, rigId: "local", kind: "plugin:forge-review", title: "MR #41", cold: false },
        {
          id: 3,
          rigId: "local",
          kind: "plugin:forge-review",
          title: "MR #42",
          restoreOnRestart: false,
        },
      ],
      activeId: 2,
      splitTabId: 0,
      focusedPane: "left",
      booted: true,
      activeRigIdForNewTabs: "local",
      activeTabByRig: { local: 2 },
    });

    expect(discardRestoredForgeReviewTabs(workspaceTabs)).toBe(true);
    expect(workspaceTabs.transition).toHaveBeenCalledWith({
      tabs: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 3 })],
      activeId: 3,
    });
  });
});
