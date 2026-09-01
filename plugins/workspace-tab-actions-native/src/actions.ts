import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type {
  WorkspaceTabActionsCapability,
  WorkspaceTabActionsSnapshot,
  WorkspaceTabBulkCloseMode,
  WorkspaceTabCloseGuardRegistry,
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";

export interface WorkspaceTabActionsDependencies {
  tabs: WorkspaceTabsCapability;
  terminalSessions: TerminalSessionsCapability;
  guards: WorkspaceTabCloseGuardRegistry;
}

export function createWorkspaceTabActions(
  dependencies: WorkspaceTabActionsDependencies,
): WorkspaceTabActionsCapability {
  const listeners = new Set<() => void>();
  let snapshot: WorkspaceTabActionsSnapshot = {
    revision: 0,
    pendingKindClose: null,
    pendingDeleteTabs: null,
    pendingBulkClose: null,
  };
  const publish = (
    next: Omit<WorkspaceTabActionsSnapshot, "revision">,
  ): void => {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    for (const listener of listeners) listener();
  };
  const patch = (
    next: Partial<Omit<WorkspaceTabActionsSnapshot, "revision">>,
  ): void => publish({ ...snapshot, ...next });

  const dispose = (id: number): void => {
    const tab = dependencies.tabs
      .snapshot()
      .tabs.find((candidate) => candidate.id === id);
    if (!tab || !dependencies.tabs.close(id)) return;
    if (tab.kind !== "terminal") return;
    for (const leafId of terminalLeafIds(tab.data?.paneTree)) {
      dependencies.terminalSessions.dispose(leafId);
    }
  };

  const verdict = async (tab: WorkspaceTabRecord) =>
    (await dependencies.guards
      .snapshot()
      .find((guard) => guard.kinds.includes(tab.kind))
      ?.canClose(tab)) ?? "close";

  return {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close(id) {
      const tab = dependencies.tabs
        .snapshot()
        .tabs.find((candidate) => candidate.id === id);
      if (tab) {
        const result = await verdict(tab);
        if (result === "cancel") return;
        if (result !== "close") {
          patch({ pendingKindClose: { id, prompt: result.prompt } });
          return;
        }
      }
      dispose(id);
    },
    async closeMany(anchorId, mode) {
      const current = dependencies.tabs.snapshot().tabs;
      const ids = planBulkClose(current, anchorId, mode);
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const prompted: number[] = [];
      for (const tab of current.filter((candidate) =>
        idSet.has(candidate.id),
      )) {
        const result = await verdict(tab);
        if (result === "cancel") continue;
        if (result !== "close") prompted.push(tab.id);
        else dispose(tab.id);
      }
      if (prompted.length > 0) patch({ pendingBulkClose: prompted });
    },
    newRightOf(anchorId) {
      const current = dependencies.tabs.snapshot();
      const anchor = current.tabs.find((tab) => tab.id === anchorId);
      const [tabId, leafId] = dependencies.tabs.allocate(2);
      const cwd =
        anchor?.kind === "terminal" && typeof anchor.data?.cwd === "string"
          ? anchor.data.cwd
          : undefined;
      const tab: WorkspaceTabRecord = {
        id: tabId,
        rigId: anchor?.rigId ?? current.activeRigIdForNewTabs,
        kind: "terminal",
        title: "shell",
        data: {
          cwd,
          paneTree: { kind: "leaf", id: leafId, cwd },
          activeLeafId: leafId,
        },
      };
      const index = current.tabs.findIndex(
        (candidate) => candidate.id === anchorId,
      );
      const tabs = [...current.tabs];
      tabs.splice(index < 0 ? tabs.length : index + 1, 0, tab);
      dependencies.tabs.transition({ tabs, activeId: tabId });
      return tabId;
    },
    duplicate(id) {
      const current = dependencies.tabs.snapshot();
      const source = current.tabs.find((tab) => tab.id === id);
      if (!source) return null;
      const newId = dependencies.tabs.allocate(1)[0];
      let clone: WorkspaceTabRecord | null = null;
      if (source.kind === "terminal") {
        const leafId = dependencies.tabs.allocate(1)[0];
        const cwd =
          typeof source.data?.cwd === "string" ? source.data.cwd : undefined;
        clone = {
          ...source,
          id: newId,
          cold: false,
          data: {
            ...source.data,
            paneTree: { kind: "leaf", id: leafId, cwd },
            activeLeafId: leafId,
          },
        };
      } else if (source.kind === "editor") {
        clone = {
          ...source,
          id: newId,
          cold: false,
          data: { ...source.data, preview: false },
        };
      } else if (source.kind === "markdown" || source.kind === "preview") {
        clone = { ...source, id: newId, cold: false };
      }
      if (!clone) return null;
      const index = current.tabs.findIndex((tab) => tab.id === id);
      const tabs = [...current.tabs];
      tabs.splice(index + 1, 0, clone);
      dependencies.tabs.transition({ tabs, activeId: newId });
      return newId;
    },
    rename(id, title) {
      const current = dependencies.tabs.snapshot();
      dependencies.tabs.transition({
        tabs: current.tabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                data: {
                  ...tab.data,
                  customTitle: title.trim() || undefined,
                },
              }
            : tab,
        ),
      });
    },
    pathDeleted(path) {
      const dirty: number[] = [];
      for (const tab of dependencies.tabs.snapshot().tabs) {
        if (tab.kind !== "editor") continue;
        const tabPath = tab.data?.path;
        if (
          typeof tabPath !== "string" ||
          (tabPath !== path && !tabPath.startsWith(`${path}/`))
        ) {
          continue;
        }
        if (tab.data?.dirty === true) dirty.push(tab.id);
        else dispose(tab.id);
      }
      if (dirty.length > 0) patch({ pendingDeleteTabs: dirty });
    },
    confirmKindClose() {
      const pending = snapshot.pendingKindClose;
      if (pending) dispose(pending.id);
      patch({ pendingKindClose: null });
    },
    cancelKindClose: () => patch({ pendingKindClose: null }),
    confirmDeleteClose() {
      for (const id of snapshot.pendingDeleteTabs ?? []) dispose(id);
      patch({ pendingDeleteTabs: null });
    },
    cancelDeleteClose: () => patch({ pendingDeleteTabs: null }),
    confirmBulkClose() {
      for (const id of snapshot.pendingBulkClose ?? []) dispose(id);
      patch({ pendingBulkClose: null });
    },
    cancelBulkClose: () => patch({ pendingBulkClose: null }),
  };
}

function planBulkClose(
  tabs: readonly WorkspaceTabRecord[],
  anchorId: number,
  mode: WorkspaceTabBulkCloseMode,
): number[] {
  const anchor = tabs.find((tab) => tab.id === anchorId);
  if (!anchor) return [];
  const strip = tabs.filter((tab) => tab.rigId === anchor.rigId);
  const index = strip.findIndex((tab) => tab.id === anchorId);
  const targets =
    mode === "all"
      ? strip
      : mode === "others"
        ? strip.filter((tab) => tab.id !== anchorId)
        : mode === "right"
          ? strip.slice(index + 1)
          : strip.slice(0, index);
  return targets.map((tab) => tab.id);
}

function terminalLeafIds(value: unknown): number[] {
  if (!value || typeof value !== "object") return [];
  const node = value as {
    kind?: unknown;
    id?: unknown;
    children?: unknown;
    first?: unknown;
    second?: unknown;
  };
  if (node.kind === "leaf" && Number.isSafeInteger(node.id)) {
    return [node.id as number];
  }
  if (node.kind !== "split") return [];
  if (Array.isArray(node.children)) {
    return node.children.flatMap(terminalLeafIds);
  }
  return [...terminalLeafIds(node.first), ...terminalLeafIds(node.second)];
}
