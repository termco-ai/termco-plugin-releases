/**
 * `useEditorFileSync` — keeps open editor tabs in sync with disk changes.
 *
 * Reloads editor panes when an AI diff is applied, when a non-editor source
 * writes a file (`fs:file-written`), or when the fs watcher reports a change,
 * and maintains the watch set covering the directories of open editor files.
 */
import {
  listenFsChanged,
  parentDir,
  watchAdd,
  watchRemove,
} from "../../watch";
import type { Tab } from "../../tabs";
import type { WorkspaceEnv } from "../../workspace";
import { getCurrentWebviewWindow } from "../../webviewWindow";
import { type RefObject, useEffect, useRef } from "react";
import type { EditorPaneHandle } from "../EditorPane";

type Params = {
  tabs: Tab[];
  tabsRef: RefObject<Tab[]>;
  editorRefs: RefObject<Map<number, EditorPaneHandle>>;
  /** The active rig's env — editor-file watches register against it, not the
   * global env at call-time. */
  env: WorkspaceEnv;
};

/**
 * Keeps open editor tabs in sync with on-disk changes: reloads on applied AI
 * diffs, external writes, and fs-watch events, and maintains the watch set for
 * the directories of open editor files.
 */
export function useEditorFileSync({ tabs, tabsRef, editorRefs, env }: Params) {
  const envRef = useRef(env);
  envRef.current = env;
  // When an AI diff is approved (write_file applied to disk), reload any
  // open editor tabs for that path so the user sees the new content. We
  // track which approvalIds we've already handled to fire the reload only
  // once per applied diff.
  const appliedDiffsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of tabs) {
      if (t.kind !== "ai-diff") continue;
      if (t.status !== "approved") continue;
      if (appliedDiffsRef.current.has(t.approvalId)) continue;
      appliedDiffsRef.current.add(t.approvalId);
      for (const e of tabs) {
        if (e.kind !== "editor") continue;
        if (e.path !== t.path) continue;
        editorRefs.current.get(e.id)?.reload();
      }
    }
  }, [tabs, editorRefs]);

  useEffect(() => {
    type FileWrittenPayload = { path: string; source?: string };
    const unlistenPromise =
      getCurrentWebviewWindow().listen<FileWrittenPayload>(
        "fs:file-written",
        (event) => {
          if (event.payload.source === "editor") return;
          const normalizedPath = event.payload.path.replace(/\\/g, "/");
          const currentTabs = tabsRef.current;
          for (const t of currentTabs) {
            if (t.kind !== "editor") continue;
            if (t.path.replace(/\\/g, "/") === normalizedPath) {
              editorRefs.current.get(t.id)?.reload();
            }
          }
        },
      );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, [tabsRef, editorRefs]);

  const editorWatchRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const want = new Set<string>();
    for (const t of tabs) if (t.kind === "editor") want.add(parentDir(t.path));
    const prev = editorWatchRef.current;
    const toAdd = [...want].filter((d) => !prev.has(d));
    const toRemove = [...prev].filter((d) => !want.has(d));
    watchAdd(toAdd, envRef.current);
    watchRemove(toRemove, envRef.current);
    editorWatchRef.current = want;
  }, [tabs]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const changed = new Set(paths.map((p) => p.replace(/\\/g, "/")));
      for (const t of tabsRef.current) {
        if (t.kind !== "editor") continue;
        if (changed.has(t.path.replace(/\\/g, "/"))) {
          editorRefs.current.get(t.id)?.reload();
        }
      }
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [tabsRef, editorRefs]);
}
