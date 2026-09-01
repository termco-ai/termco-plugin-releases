/**
 * Per-chat workspace snapshot. While a chat is active it debounce-captures the
 * active rig's tab layout (reusing the rigs serialize code) into that
 * session's snapshot. `requestWorkspaceRestore()` reopens the snapshot's tabs
 * into the current rig, deduped and non-destructively (current tabs stay).
 *
 * Terminals restore layout + cwd only (no live output/processes, like an app
 * restart); editor files restore fully.
 */
import {
  findLeafCwd,
  hydrateTabs,
  isSerializableTab,
  serializeTabs,
  type WorkspaceTab as Tab,
} from "./workspaceSerialization";
import type { WorkspaceTabRecord } from "@termco/workspace-base";
import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "../store/chatStore";
import { loadSnapshot, saveSnapshot } from "../../sessions";

export const WORKSPACE_RESTORE_EVENT = "termco://restore-workspace";

/** Ask the app to reopen the active chat's captured workspace. */
export function requestWorkspaceRestore(): void {
  window.dispatchEvent(new CustomEvent(WORKSPACE_RESTORE_EVENT));
}

const CAPTURE_DEBOUNCE_MS = 2500;

type Params = {
  tabs: readonly WorkspaceTabRecord[];
  activeRigId: string;
  activeSessionId: string | null;
  /** Gate capture until boot hydration finishes (so restore never round-trips). */
  enabled: boolean;
  allocId: () => number;
  replaceTabs: (next: readonly WorkspaceTabRecord[], nextActiveId: number) => void;
};

function recordToTab(record: WorkspaceTabRecord): Tab | null {
  const data = record.data ?? {};
  const base = {
    id: record.id,
    rigId: record.rigId,
    kind: record.kind,
    title: record.title,
    ...(record.cold === undefined ? {} : { cold: record.cold }),
  };
  if (
    record.kind === "terminal" &&
    data.paneTree &&
    typeof data.paneTree === "object" &&
    typeof data.activeLeafId === "number"
  ) {
    return {
      ...base,
      kind: "terminal",
      paneTree: data.paneTree as Extract<Tab, { kind: "terminal" }>["paneTree"],
      activeLeafId: data.activeLeafId,
      ...(typeof data.cwd === "string" ? { cwd: data.cwd } : {}),
      ...(data.private === true ? { private: true } : {}),
      ...(data.blocks === true ? { blocks: true } : {}),
      ...(typeof data.customTitle === "string"
        ? { customTitle: data.customTitle }
        : {}),
    };
  }
  if (record.kind === "editor" && typeof data.path === "string") {
    return { ...base, kind: "editor", path: data.path };
  }
  if (record.kind === "preview" && typeof data.url === "string") {
    return { ...base, kind: "preview", url: data.url };
  }
  if (record.kind === "markdown" && typeof data.path === "string") {
    return { ...base, kind: "markdown", path: data.path };
  }
  if (record.kind.startsWith("plugin:")) {
    return { ...base, kind: record.kind as `plugin:${string}`, data: { ...data } };
  }
  return null;
}

function tabToRecord(tab: Tab): WorkspaceTabRecord {
  const { id, rigId, kind, title, cold } = tab;
  const data =
    kind === "terminal"
      ? {
          paneTree: tab.paneTree,
          activeLeafId: tab.activeLeafId,
          ...(tab.cwd === undefined ? {} : { cwd: tab.cwd }),
          ...(tab.private === undefined ? {} : { private: tab.private }),
          ...(tab.blocks === undefined ? {} : { blocks: tab.blocks }),
          ...(tab.customTitle === undefined
            ? {}
            : { customTitle: tab.customTitle }),
        }
      : kind === "editor" || kind === "markdown"
        ? { path: tab.path }
        : kind === "preview"
          ? { url: tab.url }
          : { ...(tab.data ?? {}) };
  return { id, rigId, kind, title, ...(cold === undefined ? {} : { cold }), data };
}

function terminalCwd(tab: Tab): string | null {
  if (tab.kind !== "terminal") return null;
  return findLeafCwd(tab.paneTree, tab.activeLeafId) ?? tab.cwd ?? null;
}

export function useWorkspaceSnapshot({
  tabs,
  activeRigId,
  activeSessionId,
  enabled,
  allocId,
  replaceTabs,
}: Params) {
  const setSnapshotAvailable = useChatStore((s) => s.setSnapshotAvailable);
  const latest = useRef({ tabs, activeRigId, activeSessionId });
  const availabilityRevision = useRef(0);
  latest.current = { tabs, activeRigId, activeSessionId };

  // Capture: debounce-serialize the active rig's tabs into the active chat.
  useEffect(() => {
    if (!enabled || !activeSessionId) return;
    const timer = setTimeout(() => {
      const rigTabs = tabs.flatMap((record) => {
        const tab = recordToTab(record);
        return tab ? [tab] : [];
      }).filter(
        (t) => t.rigId === activeRigId && isSerializableTab(t),
      );
      if (rigTabs.length === 0) return;
      void saveSnapshot(activeSessionId, {
        tabs: serializeTabs(rigTabs),
        capturedAt: Date.now(),
      });
      availabilityRevision.current += 1;
      setSnapshotAvailable(true);
    }, CAPTURE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tabs, activeRigId, activeSessionId, enabled, setSnapshotAvailable]);

  // Availability: does the active chat already have a restorable snapshot?
  useEffect(() => {
    const revision = ++availabilityRevision.current;
    if (!activeSessionId) {
      setSnapshotAvailable(false);
      return;
    }
    let alive = true;
    void loadSnapshot(activeSessionId).then((snap) => {
      if (alive && availabilityRevision.current === revision) {
        setSnapshotAvailable(!!snap && snap.tabs.length > 0);
      }
    });
    return () => {
      alive = false;
    };
  }, [activeSessionId, setSnapshotAvailable]);

  // Restore (non-destructive): reopen the snapshot's tabs into the current
  // rig, deduped, without wiping what's already open.
  const restore = useCallback(async () => {
    const {
      activeSessionId: sid,
      activeRigId: rigId,
      tabs: cur,
    } = latest.current;
    if (!sid) return;
    const snap = await loadSnapshot(sid);
    if (!snap || snap.tabs.length === 0) return;
    const rebuilt = hydrateTabs(snap.tabs, rigId, allocId);
    if (rebuilt.length === 0) return;

    const currentTabs = cur.flatMap((record) => {
      const tab = recordToTab(record);
      return tab ? [tab] : [];
    });
    const rigTabs = currentTabs.filter((t) => t.rigId === rigId);
    const existingCwds = new Set(
      rigTabs.map(terminalCwd).filter((c): c is string => c != null),
    );
    const existingPaths = new Set(
      rigTabs
        .filter(
          (t): t is Extract<Tab, { kind: "editor" }> => t.kind === "editor",
        )
        .map((t) => t.path),
    );
    const additions = rebuilt.filter((t) => {
      if (t.kind === "terminal") {
        const c = terminalCwd(t);
        return !(c && existingCwds.has(c));
      }
      if (t.kind === "editor") return !existingPaths.has(t.path);
      return true;
    });
    if (additions.length === 0) return; // everything already open
    replaceTabs([...cur, ...additions.map(tabToRecord)], additions[0].id);
  }, [allocId, replaceTabs]);

  useEffect(() => {
    const onRestore = () => void restore();
    window.addEventListener(WORKSPACE_RESTORE_EVENT, onRestore);
    return () => window.removeEventListener(WORKSPACE_RESTORE_EVENT, onRestore);
  }, [restore]);
}
