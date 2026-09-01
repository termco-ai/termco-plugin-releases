import type { EditorSessionsCapability } from "@termco/editor-base";
import type { EditorPaneHandle } from "./editor";

const handles = new Map<number, EditorPaneHandle>();
const dirty = new Map<number, { path: string; title: string }>();
const listeners = new Set<() => void>();
const readyWaiters = new Map<number, Set<() => void>>();

function notify(): void {
  for (const listener of listeners) listener();
}

function run(id: number, action: (handle: EditorPaneHandle) => void): boolean {
  const handle = handles.get(id);
  if (!handle) return false;
  action(handle);
  return true;
}

export function registerEditorSession(
  id: number,
  handle: EditorPaneHandle | null,
): void {
  if (handle) handles.set(id, handle);
  else {
    handles.delete(id);
    dirty.delete(id);
  }
  if (handle) {
    for (const resolve of readyWaiters.get(id) ?? []) resolve();
    readyWaiters.delete(id);
  }
  notify();
}

export function editorSessionHandle(id: number): EditorPaneHandle | null {
  return handles.get(id) ?? null;
}

export function setEditorSessionDirty(
  id: number,
  isDirty: boolean,
  path: string,
  title: string,
): void {
  if (isDirty) dirty.set(id, { path, title });
  else dirty.delete(id);
}

export function dirtyEditorSessions() {
  return [...dirty].map(([id, value]) => ({
    id: String(id),
    label: value.title || value.path,
  }));
}

export const editorSessions: EditorSessionsCapability = {
  ids: () => [...handles.keys()],
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  whenReady(id) {
    if (handles.has(id)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const waiters = readyWaiters.get(id) ?? new Set();
      waiters.add(resolve);
      readyWaiters.set(id, waiters);
    });
  },
  setQuery: (id, query) => run(id, (handle) => handle.setQuery(query)),
  findNext: (id) => run(id, (handle) => handle.findNext()),
  findPrevious: (id) => run(id, (handle) => handle.findPrevious()),
  clearQuery: (id) => run(id, (handle) => handle.clearQuery()),
  focus: (id) => run(id, (handle) => handle.focus()),
  selection: (id) => handles.get(id)?.getSelection() ?? null,
  path: (id) => handles.get(id)?.getPath() ?? null,
  async save(id) {
    const handle = handles.get(id);
    if (!handle) return false;
    await handle.save();
    return true;
  },
  reload: (id) => handles.get(id)?.reload() ?? false,
  gotoLine: (id, line, character) =>
    run(id, (handle) => handle.gotoLine(line, character)),
  undo: (id) => run(id, (handle) => handle.undo()),
  redo: (id) => run(id, (handle) => handle.redo()),
};

export function clearEditorSessions(): void {
  handles.clear();
  dirty.clear();
  for (const waiters of readyWaiters.values()) {
    for (const resolve of waiters) resolve();
  }
  readyWaiters.clear();
  notify();
}
