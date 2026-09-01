import type { TerminalPaneSessionHandle, TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import {
  clearFocusedTerminal,
  disposeSession,
  leafIdForPty,
  leafHasForegroundProcess,
  navigateFocusedBlocks,
  whenSessionReady,
  writeToSession,
} from "./terminal/lib/useTerminalSession";

const handles = new Map<number, TerminalPaneSessionHandle>();
let workspaceTabs: WorkspaceTabsCapability | null = null;

export function terminalSessionsConfigured(): boolean {
  return workspaceTabs !== null;
}

function requireWorkspaceTabs(): WorkspaceTabsCapability {
  if (!workspaceTabs) {
    throw new Error("terminal.sessions is not connected to workspace.tabs");
  }
  return workspaceTabs;
}

function terminalRecord(
  tabId: number,
  leafId: number,
  rigId: string,
  input: Parameters<TerminalSessionsCapability["open"]>[0] = {},
) {
  return {
    id: tabId,
    rigId,
    kind: "terminal",
    title:
      input.title ??
      (input.private ? "private" : input.blocks ? "blocks" : "shell"),
    data: {
      cwd: input.cwd,
      paneTree: { kind: "leaf" as const, id: leafId, cwd: input.cwd },
      activeLeafId: leafId,
      ...(input.blocks ? { blocks: true } : {}),
      ...(input.private ? { private: true } : {}),
    },
  };
}

function leafIds(value: unknown): number[] {
  if (!value || typeof value !== "object") return [];
  const node = value as {
    kind?: unknown;
    id?: unknown;
    children?: unknown;
  };
  if (node.kind === "leaf" && Number.isSafeInteger(node.id)) {
    return [node.id as number];
  }
  if (node.kind !== "split" || !Array.isArray(node.children)) return [];
  return node.children.flatMap(leafIds);
}

export function configureTerminalSessions(
  tabs: WorkspaceTabsCapability,
): () => void {
  workspaceTabs = tabs;
  return () => {
    if (workspaceTabs === tabs) workspaceTabs = null;
  };
}

export const terminalSessions: TerminalSessionsCapability = {
  open(input = {}) {
    const tabsProvider = requireWorkspaceTabs();
    const snapshot = tabsProvider.snapshot();
    const [tabId, leafId] = tabsProvider.allocate(2);
    const rigId =
      input.rigId ??
      snapshot.tabs.find((tab) => tab.id === snapshot.activeId)?.rigId ??
      snapshot.activeRigIdForNewTabs;
    const record = terminalRecord(tabId, leafId, rigId, input);
    const tabs = [...snapshot.tabs, record];
    if (!snapshot.initialized) {
      tabsProvider.initialize({
        tabs,
        activeId: tabId,
        splitTabId: 0,
        activeRigIdForNewTabs: rigId,
      });
    } else if (snapshot.splitTabId !== 0 && snapshot.focusedPane === "right") {
      tabsProvider.transition({ tabs, splitTabId: tabId });
    } else {
      tabsProvider.transition({ tabs, activeId: tabId });
    }
    return { tabId, leafId };
  },
  reset(input = {}) {
    const tabsProvider = requireWorkspaceTabs();
    const snapshot = tabsProvider.snapshot();
    const [tabId, leafId] = tabsProvider.allocate(2);
    const rigId = input.rigId ?? snapshot.activeRigIdForNewTabs;
    const record = terminalRecord(tabId, leafId, rigId, input);
    const oldLeaves = snapshot.tabs.flatMap((tab) =>
      tab.kind === "terminal" ? leafIds(tab.data?.paneTree) : [],
    );
    tabsProvider.transition({
      tabs: [record],
      activeId: tabId,
      splitTabId: 0,
      focusedPane: "left",
    });
    for (const oldLeafId of oldLeaves) terminalSessions.dispose(oldLeafId);
    return { tabId, leafId };
  },
  register(leafId, handle) {
    if (handle) handles.set(leafId, handle);
    else handles.delete(leafId);
  },
  handle: (leafId) => handles.get(leafId) ?? null,
  leafIds: () => [...handles.keys()],
  leafForPty: leafIdForPty,
  write: writeToSession,
  focus(leafId) {
    const handle = handles.get(leafId);
    handle?.focus();
    return Boolean(handle);
  },
  buffer: (leafId, maxLines) => handles.get(leafId)?.getBuffer(maxLines) ?? null,
  selection: (leafId) => handles.get(leafId)?.getSelection() ?? null,
  whenReady: whenSessionReady,
  async hasForegroundProcesses() {
    const running = await Promise.all(
      terminalSessions.leafIds().map((leafId) =>
        leafHasForegroundProcess(leafId),
      ),
    );
    return running.some(Boolean);
  },
  clearFocused: clearFocusedTerminal,
  navigateFocusedBlocks,
  dispose(leafId) {
    handles.delete(leafId);
    disposeSession(leafId);
  },
};

export function clearTerminalSessions(): void {
  handles.clear();
}
