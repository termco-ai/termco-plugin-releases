import type {
  EditorNavigationCapability,
  EditorSessionsCapability,
} from "@termco/editor-base";
import type {
  WorkspaceTabRecord,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";

let open = false;
const listeners = new Set<() => void>();
let workspaceTabs: WorkspaceTabsCapability | null = null;
let editorSessions: EditorSessionsCapability | null = null;

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function selectTab(tabs: WorkspaceTabsCapability, id: number): void {
  const snapshot = tabs.snapshot();
  if (snapshot.splitTabId === id) {
    tabs.transition({ focusedPane: "right" });
  } else {
    tabs.transition({ activeId: id });
  }
}

function openFile(path: string, pin = true): number {
  if (!workspaceTabs) {
    throw new Error("editor.navigation is not connected to workspace.tabs");
  }
  const snapshot = workspaceTabs.snapshot();
  const current = snapshot.tabs;
  if (pin) {
    const existing = current.find(
      (tab) => tab.kind === "editor" && tab.data?.path === path,
    );
    if (existing) {
      if (existing.data?.preview === true) {
        workspaceTabs.transition({
          tabs: current.map((tab) =>
            tab.id === existing.id
              ? { ...tab, data: { ...tab.data, preview: false } }
              : tab,
          ),
          activeId: existing.id,
        });
      } else {
        selectTab(workspaceTabs, existing.id);
      }
      return existing.id;
    }
  } else {
    const persistent = current.find(
      (tab) =>
        tab.kind === "editor" &&
        tab.data?.path === path &&
        tab.data?.preview !== true,
    );
    if (persistent) {
      selectTab(workspaceTabs, persistent.id);
      return persistent.id;
    }
    const existingPreview = current.find(
      (tab) =>
        tab.kind === "editor" &&
        tab.data?.path === path &&
        tab.data?.preview === true,
    );
    if (existingPreview) {
      selectTab(workspaceTabs, existingPreview.id);
      return existingPreview.id;
    }
  }

  const [id] = workspaceTabs.allocate(1);
  const record: WorkspaceTabRecord = {
    id,
    kind: "editor",
    rigId: snapshot.activeRigIdForNewTabs,
    title: basename(path),
    data: { path, dirty: false, preview: !pin },
  };
  const previewIndex = pin
    ? -1
    : current.findIndex(
        (tab) => tab.kind === "editor" && tab.data?.preview === true,
      );
  const nextTabs = [...current];
  if (previewIndex === -1) nextTabs.push(record);
  else nextTabs[previewIndex] = record;
  if (!snapshot.initialized) {
    workspaceTabs.initialize({
      tabs: nextTabs,
      activeId: id,
      splitTabId: 0,
      activeRigIdForNewTabs: record.rigId,
    });
  } else {
    workspaceTabs.transition({ tabs: nextTabs, activeId: id });
  }
  return id;
}

function publish(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export const editorNavigation: EditorNavigationCapability = {
  openNewFile: () => publish(true),
  openFile,
  openFileAt(path, line, pin = true) {
    const id = openFile(path, pin);
    const sessions = editorSessions;
    if (sessions) {
      void sessions.whenReady(id).then(() => sessions.gotoLine(id, line));
    }
    return id;
  },
  pin(id) {
    if (!workspaceTabs) return false;
    const snapshot = workspaceTabs.snapshot();
    const target = snapshot.tabs.find(
      (tab) => tab.id === id && tab.kind === "editor",
    );
    if (!target) return false;
    workspaceTabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === id
          ? { ...tab, data: { ...tab.data, preview: false } }
          : tab,
      ),
    });
    return true;
  },
  setLanguage(id, language) {
    if (!workspaceTabs) return false;
    const snapshot = workspaceTabs.snapshot();
    const target = snapshot.tabs.find(
      (tab) => tab.id === id && tab.kind === "editor",
    );
    if (!target) return false;
    workspaceTabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === id
          ? { ...tab, data: { ...tab.data, overrideLanguage: language } }
          : tab,
      ),
    });
    return true;
  },
  retargetPath(from, to) {
    if (!workspaceTabs) return 0;
    const snapshot = workspaceTabs.snapshot();
    let changed = 0;
    const tabs = snapshot.tabs.map((tab) => {
      const path = tab.kind === "editor" ? tab.data?.path : undefined;
      if (
        typeof path !== "string" ||
        (path !== from && !path.startsWith(`${from}/`))
      ) {
        return tab;
      }
      const nextPath = path === from ? to : `${to}${path.slice(from.length)}`;
      changed += 1;
      return {
        ...tab,
        title: basename(nextPath),
        data: { ...tab.data, path: nextPath },
      };
    });
    if (changed > 0) workspaceTabs.transition({ tabs });
    return changed;
  },
};

export function configureEditorNavigation(
  tabs: WorkspaceTabsCapability,
  sessions: EditorSessionsCapability,
): () => void {
  workspaceTabs = tabs;
  editorSessions = sessions;
  return () => {
    if (workspaceTabs === tabs) workspaceTabs = null;
    if (editorSessions === sessions) editorSessions = null;
  };
}

export function editorNavigationRuntimeActive(): boolean {
  return workspaceTabs !== null && editorSessions !== null;
}

export function setNewFileOpen(next: boolean): void {
  publish(next);
}

export function newFileOpen(): boolean {
  return open;
}

export function subscribeNewFile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
