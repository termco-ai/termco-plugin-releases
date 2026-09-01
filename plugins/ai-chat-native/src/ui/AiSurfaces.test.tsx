import type {
  WorkspaceRigsCapability,
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
  WorkspaceTabsTransition,
} from "@termco/workspace-base";
import { describe, expect, it } from "vitest";
import {
  closeAiDiffTab,
  createAiBackgroundContribution,
  openAiDiffTab,
  visibleMessageText,
} from "./AiSurfaces";

function tabsStore(initial: WorkspaceTabRecord[]): WorkspaceTabsCapability {
  let snapshot: WorkspaceTabsSnapshot = {
    revision: 1,
    initialized: true,
    tabs: initial,
    activeId: initial[0]?.id ?? 0,
    splitTabId: 0,
    focusedPane: "left",
    booted: true,
    activeRigIdForNewTabs: "rig-b",
    activeTabByRig: {},
  };
  let nextId = 20;
  const commit = (next: WorkspaceTabsTransition) => {
    snapshot = {
      ...snapshot,
      ...next,
      tabs: next.tabs ?? snapshot.tabs,
      revision: snapshot.revision + 1,
      initialized: true,
    };
  };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: commit,
    allocate: (count = 1) =>
      Array.from({ length: count }, () => nextId++),
    transition: commit,
    nextActiveInRig: (closingId) => {
      const closing = snapshot.tabs.find((tab) => tab.id === closingId);
      if (!closing) return null;
      const sameRig = snapshot.tabs.filter(
        (tab) => tab.rigId === closing.rigId,
      );
      if (sameRig.length <= 1) return null;
      const index = sameRig.findIndex((tab) => tab.id === closingId);
      return (sameRig[index - 1] ?? sameRig[index + 1]).id;
    },
    selectByRigIndex: () => null,
    close: () => false,
    moveToRig: () => ({ changed: false, followTargetRig: false }),
    reorderAcrossRigs: () => ({ changed: false, followTargetRig: false }),
    reorderByGap: () => false,
    savedLayouts: () => [],
    saveLayout: async () => {},
    deleteLayout: async () => {},
  };
}

describe("source-owned AI surfaces", () => {
  it("extracts visible transcript text without exposing provider internals", () => {
    expect(
      visibleMessageText({
        id: "m1",
        role: "assistant",
        parts: [
          { type: "text", text: "First" },
          { type: "reasoning", text: "private chain" },
          { type: "text", text: "Second" },
        ],
      }),
    ).toBe("First\nSecond");
  });

  it("owns composer state in the non-structural background contribution", () => {
    const store = tabsStore([]);
    expect(
      createAiBackgroundContribution({} as WorkspaceRigsCapability, store),
    ).toMatchObject({
      id: "ai-session-binding",
      Component: expect.any(Function),
    });
  });

  it("opens, deduplicates, and closes AI diff tabs through workspace.tabs", () => {
    const tabs = tabsStore([
      { id: 1, rigId: "rig-b", kind: "terminal", title: "shell" },
    ]);
    const input = {
      path: "/repo/src/app.ts",
      originalContent: "old",
      proposedContent: "new",
      approvalId: "approval-1",
      isNewFile: false,
    };

    expect(openAiDiffTab(tabs, input)).toBe(20);
    expect(openAiDiffTab(tabs, input)).toBe(20);
    expect(tabs.snapshot()).toMatchObject({
      activeId: 20,
      tabs: [
        expect.anything(),
        {
          id: 20,
          rigId: "rig-b",
          kind: "ai-diff",
          title: "app.ts (AI diff)",
          data: { ...input, status: "pending" },
        },
      ],
    });

    closeAiDiffTab(tabs, "approval-1");
    expect(tabs.snapshot()).toMatchObject({
      activeId: 1,
      tabs: [{ id: 1, kind: "terminal" }],
    });
  });
});

it("opens and closes AI diff tabs through workspace tab actions", () => {
  const tabs = tabsStore([
    { id: 1, rigId: "rig-b", kind: "terminal", title: "shell" },
  ]);
  const input = {
    path: "/repo/src/app.ts",
    originalContent: "old",
    proposedContent: "new",
    approvalId: "approval-1",
    isNewFile: false,
  };

  expect(openAiDiffTab(tabs, input)).toBe(20);
  expect(tabs.snapshot().tabs.at(-1)).toMatchObject({
    kind: "ai-diff",
    data: { approvalId: "approval-1", status: "pending" },
  });

  closeAiDiffTab(tabs, "approval-1");
  expect(tabs.snapshot().tabs).toEqual([
    expect.objectContaining({ id: 1, kind: "terminal" }),
  ]);
});
