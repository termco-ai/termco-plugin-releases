/**
 * `useFileTree` — the explorer's lazy, watched, mutable directory tree.
 *
 * Owns all tree state: per-directory async load status, the expanded-folder
 * set, inline create/rename state, and the fs-watch subscriptions that keep
 * loaded directories in sync with disk. All filesystem effects go through the
 * `fs_*` backend commands scoped to the current workspace.
 */

import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  explorerRuntime,
  useExplorerPreferences,
} from "../../../runtime";
import { listenFsChanged, watchAdd, watchRemove } from "../watch";
import { recallExpansion, rememberExpansion } from "./expansionCache";
import { isUnder, sameDirListing } from "./listingDiff";
import { dirname, joinPath } from "./paths";
import type { DirEntry, Options, PendingCreate, TreeState } from "./types";

/**
 * React hook backing {@link FileExplorer}. Returns the current tree state plus
 * the imperative actions the UI drives (toggle/expand/refresh, create, rename,
 * delete, move). `rootPath` of `null` tears everything down.
 *
 * `env` is the workspace env that OWNS `rootPath` (the active rig's). Every
 * fs read/watch/mutation sends THIS env — never the global `currentWorkspaceEnv()`
 * read at call-time. During a rig switch the global env flips a render before
 * `rootPath` catches up, so a call-time read would ship the previous rig's
 * path to the new space's backend (a local path → an ssh remote → ENOENT).
 */
export function useFileTree(
  rootPath: string | null,
  env: WorkspaceEnv,
  options?: Options,
) {
  const showHidden = useExplorerPreferences((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const gitDecorations = useExplorerPreferences(
    (s) => s.explorerGitDecorations,
  );
  const gitDecorationsRef = useRef(gitDecorations);
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);

  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  const watchedRef = useRef<Set<string>>(new Set());

  // Synced DURING render (not in an effect) so the background fs:changed
  // listener and the re-list effect — which read these refs at fire-time — always
  // see the env/root pair of the CURRENT render, never a stale one.
  const envRef = useRef(env);
  envRef.current = env;
  const rootRef = useRef(rootPath);
  rootRef.current = rootPath;

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    gitDecorationsRef.current = gitDecorations;
  }, [gitDecorations]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const addWatch = useCallback((path: string) => {
    if (watchedRef.current.has(path)) return;
    watchedRef.current.add(path);
    watchAdd([path], envRef.current);
  }, []);

  const removeWatch = useCallback((path: string) => {
    if (!watchedRef.current.delete(path)) return;
    watchRemove([path], envRef.current);
  }, []);

  const fetchChildren = useCallback(async (path: string) => {
    // Stale-scope guard: a background driver (the fs:changed listener, the
    // re-list effect closing over an old `nodes`) can fire with a path from the
    // PREVIOUS rig during a switch. Reading it here would send that path with
    // the current env → wrong backend (local path → ssh remote → ENOENT). Only
    // read paths that belong to the current root.
    const root = rootRef.current;
    if (!root || !isUnder(path, root)) return;
    if (nodesRef.current[path]?.status !== "loaded") {
      setNodes((s) => ({ ...s, [path]: { status: "loading" } }));
    }
    try {
      const entries = (await explorerRuntime().files.readDir(
        path,
        showHiddenRef.current,
        gitDecorationsRef.current,
        envRef.current,
      )) as DirEntry[];

      const prev = nodesRef.current[path];
      if (prev?.status === "loaded" && sameDirListing(prev.entries, entries)) {
        return;
      }

      const liveDirs = new Set(
        entries
          .filter((e) => e.kind === "dir")
          .map((e) => joinPath(path, e.name)),
      );
      const removedRoots: string[] = [];
      for (const key of Object.keys(nodesRef.current)) {
        if (dirname(key) === path && !liveDirs.has(key)) removedRoots.push(key);
      }
      const dead = new Set<string>();
      if (removedRoots.length > 0) {
        const candidates = new Set<string>([
          ...Object.keys(nodesRef.current),
          ...expandedRef.current,
          ...watchedRef.current,
        ]);
        for (const k of candidates) {
          if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
        }
      }

      setNodes((s) => {
        const next: TreeState = {};
        for (const [k, v] of Object.entries(s)) if (!dead.has(k)) next[k] = v;
        next[path] = { status: "loaded", entries };
        return next;
      });

      if (dead.size > 0) {
        setExpanded((c) => {
          let changed = false;
          const n = new Set(c);
          for (const d of dead) if (n.delete(d)) changed = true;
          return changed ? n : c;
        });
        const toUnwatch: string[] = [];
        for (const d of dead)
          if (watchedRef.current.delete(d)) toUnwatch.push(d);
        watchRemove(toUnwatch, envRef.current);
      }
    } catch (e) {
      setNodes((s) => ({
        ...s,
        [path]: { status: "error", message: String(e) },
      }));
    }
  }, []);

  // Root change → restore the cached expansion for this root, re-scope watches,
  // and persist the outgoing root's expansion on the way out.
  useEffect(() => {
    if (!rootPath) {
      setNodes({});
      setExpanded(new Set());
      setPendingCreate(null);
      setRenaming(null);
      return;
    }
    setPendingCreate(null);
    setRenaming(null);

    const restored = recallExpansion(rootPath);
    setExpanded(new Set(restored));
    setNodes({});
    // Sync the ref synchronously: nodesRef only updates after the next render,
    // so without this a fast (cached) fetchChildren below would read the stale
    // pre-clear "loaded" node, hit the sameDirListing early-return, and skip
    // re-populating — leaving a valid root with an empty tree when rootPath
    // changes rapidly (e.g. switching folders in quick succession).
    nodesRef.current = {};

    const toWatch = [rootPath, ...restored];
    void fetchChildren(rootPath);
    for (const d of restored) void fetchChildren(d);
    for (const p of toWatch) watchedRef.current.add(p);
    // Use the effect's own `env` (not envRef.current): the cleanup below must
    // remove these watches against the SAME backend they were added to. `env`
    // is in the dep array, so a host change (same rootPath, different ssh conn)
    // re-runs this effect and re-scopes the watches to the new backend.
    watchAdd(toWatch, env);

    return () => {
      rememberExpansion(rootPath, expandedRef.current);
      if (watchedRef.current.size > 0) {
        watchRemove([...watchedRef.current], env);
        watchedRef.current.clear();
      }
    };
  }, [rootPath, env, fetchChildren]);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const current = nodesRef.current;
      const dirs = new Set<string>();
      for (const p of paths) {
        const parent = dirname(p);
        if (current[parent]?.status === "loaded") dirs.add(parent);
        if (current[p]?.status === "loaded") dirs.add(p);
      }
      for (const d of dirs) void fetchChildren(d);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [fetchChildren]);

  useEffect(() => {
    if (!rootPath) return;
    const loadedPaths = Object.entries(nodes)
      .filter(([, state]) => state.status === "loaded")
      .map(([path]) => path);
    for (const path of loadedPaths) void fetchChildren(path);
    // Re-list loaded directories when visibility or git-decoration prefs change.
    // `nodes` is intentionally omitted so ordinary tree edits don't refetch
    // every expanded directory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden, gitDecorations, rootPath, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch],
  );

  const expand = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) return;
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      void fetchChildren(path);
    },
    [fetchChildren, addWatch],
  );

  const refresh = useCallback(
    (path: string) => {
      void fetchChildren(path);
    },
    [fetchChildren],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: "file" | "dir") => {
      setRenaming(null);
      setPendingCreate({ parentPath, kind });
      // Ensure the parent is expanded so the input row is visible.
      if (rootPath && parentPath !== rootPath) {
        setExpanded((curr) => {
          if (curr.has(parentPath)) return curr;
          const next = new Set(curr);
          next.add(parentPath);
          return next;
        });
        addWatch(parentPath);
      }
      setNodes((curr) => {
        if (!curr[parentPath]) void fetchChildren(parentPath);
        return curr;
      });
    },
    [rootPath, fetchChildren, addWatch],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = joinPath(pendingCreate.parentPath, trimmed);
      try {
        if (pendingCreate.kind === "dir") {
          await explorerRuntime().files.createDir(path, envRef.current);
        } else {
          await explorerRuntime().files.createFile(path, envRef.current);
        }
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        console.error(`create ${pendingCreate.kind} failed:`, e);
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, fetchChildren],
  );

  const beginRename = useCallback((path: string) => {
    setPendingCreate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent === "/" ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      try {
        await explorerRuntime().files.rename(renaming, to, envRef.current);
        options?.onPathRenamed?.(renaming, to);
        await fetchChildren(parent);
      } catch (e) {
        console.error("fs_rename failed:", e);
      } finally {
        setRenaming(null);
      }
    },
    [renaming, fetchChildren, options],
  );

  const deletePath = useCallback(
    async (path: string) => {
      try {
        await explorerRuntime().files.delete(path, envRef.current);
        options?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        console.error("fs_delete failed:", e);
      }
    },
    [fetchChildren, options],
  );

  const movePath = useCallback(
    async (from: string, toDir: string) => {
      const name = from.slice(from.lastIndexOf("/") + 1);
      const to = joinPath(toDir, name);
      if (to === from) return;
      const target = nodesRef.current[toDir];
      if (
        target?.status === "loaded" &&
        target.entries.some((e) => e.name === name)
      ) {
        console.warn(`move skipped: "${name}" already exists in ${toDir}`);
        return;
      }
      try {
        await explorerRuntime().files.rename(from, to, envRef.current);
        options?.onPathRenamed?.(from, to);
        await Promise.all([fetchChildren(dirname(from)), fetchChildren(toDir)]);
      } catch (e) {
        console.error("fs_rename (move) failed:", e);
      }
    },
    [fetchChildren, options],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    toggle,
    expand,
    refresh,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    movePath,
    joinPath,
  };
}
