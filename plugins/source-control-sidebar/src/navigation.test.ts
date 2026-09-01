import type { ApplicationEventsCapability } from "@termco/events-base";
import type { GitCapability } from "@termco/git-base";
import type { WorkspaceTabsCapability, WorkspaceTabsSnapshot } from "@termco/workspace-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import { describe, expect, it, vi } from "vitest";
import {
  createSourceControlNavigation,
  installTerminalDiffNavigation,
  openHistoryTab,
  openWorkingDiffTab,
} from "./navigation";

function tabRuntime(initial: WorkspaceTabsSnapshot) {
  let snapshot = initial;
  let nextId = 20;
  const tabs: WorkspaceTabsCapability = {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: vi.fn(),
    allocate: (count = 1) =>
      Array.from({ length: count }, () => nextId++),
    transition: (next) => {
      snapshot = {
        ...snapshot,
        ...next,
        revision: snapshot.revision + 1,
      };
    },
    nextActiveInRig: () => null,
    selectByRigIndex: () => null,
    close: () => false,
    moveToRig: () => ({ changed: false, followTargetRig: false }),
    reorderAcrossRigs: () => ({ changed: false, followTargetRig: false }),
    reorderByGap: () => false,
    savedLayouts: () => [],
    saveLayout: async () => {},
    deleteLayout: async () => {},
  };
  return { tabs, snapshot: () => snapshot };
}

const initial = (): WorkspaceTabsSnapshot => ({
  revision: 1,
  initialized: true,
  tabs: [
    {
      id: 1,
      rigId: "second-rig",
      kind: "editor",
      title: "app.ts",
      data: { path: "/repo/src/app.ts" },
    },
  ],
  activeId: 1,
  splitTabId: 0,
  focusedPane: "left",
  booted: true,
  activeRigIdForNewTabs: "second-rig",
  activeTabByRig: {},
});

describe("source-control graph navigation", () => {
  it("opens the history tab in the active rig", () => {
    const runtime = tabRuntime(initial());
    openHistoryTab(runtime.tabs, { repoRoot: "/repo", branch: "main" });
    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      kind: "git-history",
      rigId: "second-rig",
      title: "History · main",
      data: { repoRoot: "/repo" },
    });
    expect(runtime.snapshot().activeId).toBe(20);
  });

  it("reuses one history tab per repository", () => {
    const runtime = tabRuntime(initial());
    openHistoryTab(runtime.tabs, { repoRoot: "/repo" });
    openHistoryTab(runtime.tabs, { repoRoot: "/repo", branch: "feature" });
    expect(
      runtime
        .snapshot()
        .tabs.filter((tab) => tab.kind === "git-history"),
    ).toHaveLength(1);
    expect(runtime.snapshot().tabs.at(-1)?.title).toBe("History · feature");
  });

  it("resolves the repository from the selected tab context", async () => {
    const runtime = tabRuntime(initial());
    const git = {
      resolveRepo: vi.fn(async () => ({
        repoRoot: "/repo",
        branch: "main",
        upstream: null,
        isDetached: false,
      })),
    } as unknown as GitCapability;
    const navigation = createSourceControlNavigation(git, runtime.tabs, () => ({
      rootPath: "/other",
      workspace: {
        kind: "ssh",
        connectionId: "second",
        host: "second.example",
      },
    }));
    await navigation.openGraph();
    expect(git.resolveRepo).toHaveBeenCalledWith(
      "/repo/src",
      expect.objectContaining({ connectionId: "second" }),
    );
    expect(runtime.snapshot().tabs.at(-1)?.kind).toBe("git-history");
  });
});

describe("source-control diff navigation", () => {
  const request = {
    repoRoot: "/repo",
    path: "src/app.ts",
    mode: "-" as const,
    originalPath: null,
  };

  it("opens the working diff in the selected rig", () => {
    const runtime = tabRuntime(initial());
    const id = openWorkingDiffTab(runtime.tabs, request);
    expect(id).toBe(20);
    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      id,
      kind: "git-diff",
      rigId: "second-rig",
      title: "app.ts (-)",
      data: request,
    });
    expect(runtime.snapshot().activeId).toBe(id);
  });

  it("dedupes only within the same rig", () => {
    const runtime = tabRuntime(initial());
    const secondRigId = openWorkingDiffTab(runtime.tabs, request);
    const reused = openWorkingDiffTab(runtime.tabs, {
      ...request,
      title: "Custom diff",
      originalPath: "src/old.ts",
    });
    expect(reused).toBe(secondRigId);
    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      title: "Custom diff",
      data: { originalPath: "src/old.ts" },
    });

    runtime.tabs.transition({
      tabs: [
        ...runtime.snapshot().tabs,
        { id: 30, rigId: "local-rig", kind: "editor", title: "local" },
      ],
      activeId: 30,
      activeRigIdForNewTabs: "local-rig",
    });
    const localId = openWorkingDiffTab(runtime.tabs, request);
    expect(localId).not.toBe(secondRigId);
    expect(runtime.snapshot().tabs.at(-1)?.rigId).toBe("local-rig");
    expect(
      runtime.snapshot().tabs.filter((tab) => tab.kind === "git-diff"),
    ).toHaveLength(2);
  });

  it("opens terminal block diff intents through the selected tab provider", () => {
    const runtime = tabRuntime(initial());
    let listener: (payload: unknown) => void = () => {};
    const dispose = vi.fn();
    const events = {
      subscribe: vi.fn((event: string, next: (payload: unknown) => void) => {
        expect(event).toBe(TERMINAL_BLOCK_EVENTS.openDiff);
        listener = next;
        return dispose;
      }),
    } as unknown as ApplicationEventsCapability;

    const unsubscribe = installTerminalDiffNavigation(events, runtime.tabs);
    listener({ repoRoot: "/repo", path: "src/app.ts" });

    expect(runtime.snapshot().tabs.at(-1)).toMatchObject({
      kind: "git-diff",
      rigId: "second-rig",
      data: {
        repoRoot: "/repo",
        path: "src/app.ts",
        mode: "-",
      },
    });
    unsubscribe();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("ignores malformed terminal diff intents", () => {
    const runtime = tabRuntime(initial());
    let listener: (payload: unknown) => void = () => {};
    const events = {
      subscribe: vi.fn((_event: string, next: (payload: unknown) => void) => {
        listener = next;
        return vi.fn();
      }),
    } as unknown as ApplicationEventsCapability;

    installTerminalDiffNavigation(events, runtime.tabs);
    listener({ path: "src/app.ts" });
    listener({ repoRoot: "/repo" });

    expect(runtime.snapshot().tabs).toHaveLength(1);
  });
});
