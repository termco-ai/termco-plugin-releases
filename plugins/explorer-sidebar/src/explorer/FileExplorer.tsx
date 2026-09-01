/**
 * `FileExplorer` — the workspace file-tree pane.
 *
 * Thin container that composes the extracted pieces: it owns selection/search/
 * context-menu UI state, drives {@link useFileTree}, flattens the tree via
 * {@link buildRows}, virtualizes the result, and wires drag-and-drop, git
 * decorations, keyboard navigation, and the imperative focus handle. Row,
 * header, context-menu, and pending-input rendering live in sibling files.
 */

import type { GitStatusSnapshot } from "@termco/git-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useExplorerPreferences, useExplorerShortcuts } from "../runtime";
import { cn, ContextMenu, ContextMenuTrigger } from "../ui";
import type { RowActions } from "./components/EntryRow";
import {
  ExplorerContextMenu,
  type ExplorerContextMenuTarget,
} from "./components/ExplorerContextMenu";
import { ExplorerEmptyState } from "./components/ExplorerEmptyState";
import { ExplorerHeader } from "./components/ExplorerHeader";
import {
  ExplorerSearch,
  type ExplorerSearchHandle,
} from "./components/ExplorerSearch";
import { ExplorerTreeBody } from "./components/ExplorerTreeBody";
import { useExplorerKeyboardNav } from "./hooks/useExplorerKeyboardNav";
import { buildRows, OVERSCAN, ROW_HEIGHT, type Row } from "./lib/buildRows";
import { useExplorerDnd } from "./lib/useExplorerDnd";
import { useExplorerFileDrop } from "./lib/useExplorerFileDrop";
import { isUnder, useFileTree } from "./lib/useFileTree";
import { useGitStatus } from "./lib/useGitStatus";

export type FileExplorerHandle = {
  focus: () => void;
  isFocused: () => boolean;
  focusSearch: () => void;
  /** Expand down to `path` (a directory under the root) and select it. */
  revealPath: (path: string) => void;
};

type Props = {
  rootPath: string | null;
  /** The env that owns `rootPath` (the active rig's) — all fs reads/watches
   * use this, never the global env at call-time. */
  env: WorkspaceEnv;
  activeFilePath?: string | null;
  onOpenFile: (path: string, pin?: boolean) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  gitStatus?: GitStatusSnapshot | null;
};

export const FileExplorer = memo(
  forwardRef<FileExplorerHandle, Props>(function FileExplorer(
    {
      rootPath,
      env,
      activeFilePath,
      onOpenFile,
      onPathRenamed,
      onPathDeleted,
      onRevealInTerminal,
      onAttachToAgent,
      gitStatus,
    },
    ref,
  ) {
    // TanStack Virtual mutates the virtualizer in place and rerenders after
    // measuring; React Compiler memoization would keep getVirtualItems() stale.
    "use no memo";
    const tree = useFileTree(rootPath, env, { onPathRenamed, onPathDeleted });
    const gitDecorations = useExplorerPreferences(
      (s) => s.explorerGitDecorations,
    );
    const { lookup: lookupGitStatus } = useGitStatus(
      rootPath,
      env,
      gitDecorations ? gitStatus : null,
      gitDecorations,
    );
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSearchActive, setIsSearchActive] = useState(false);
    const searchRef = useRef<ExplorerSearchHandle>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const { rows, entryIndexByPath } = useMemo(() => {
      if (!rootPath)
        return {
          rows: [] as Row[],
          entryIndexByPath: new Map<string, number>(),
        };
      return buildRows(rootPath, tree, lookupGitStatus);
      // `tree` is intentionally omitted: its identity changes every render, but
      // the listed fields are the only inputs buildRows actually reads.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      rootPath,
      tree.nodes,
      tree.expanded,
      tree.renaming,
      tree.pendingCreate,
      lookupGitStatus,
    ]);

    const rowActions = useMemo<RowActions>(
      () => ({
        toggle: tree.toggle,
        beginRename: tree.beginRename,
        commitRename: tree.commitRename,
        cancelRename: tree.cancelRename,
      }),
      [tree.toggle, tree.beginRename, tree.commitRename, tree.cancelRename],
    );
    const renameInProgress =
      tree.renaming !== null || tree.pendingCreate !== null;

    const [menuTarget, setMenuTarget] =
      useState<ExplorerContextMenuTarget | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    // Bumped on every right-click so the menu content remounts and the popper
    // re-anchors to the new cursor (floating-ui won't reposition on an anchor
    // change alone, only on scroll/resize).
    const [menuNonce, setMenuNonce] = useState(0);

    const entryPaths = useMemo<string[]>(() => {
      const out: string[] = [];
      for (const row of rows) if (row.kind === "entry") out.push(row.path);
      return out;
    }, [rows]);

    const isDirAt = useCallback(
      (path: string): boolean | undefined => {
        const idx = entryIndexByPath.get(path);
        const row = idx !== undefined ? rows[idx] : undefined;
        return row?.kind === "entry" ? row.isDir : undefined;
      },
      [entryIndexByPath, rows],
    );
    const dnd = useExplorerDnd({
      rootPath: rootPath ?? "",
      isDir: isDirAt,
      onMove: tree.movePath,
    });

    const fileDrop = useExplorerFileDrop({
      rootPath,
      env,
      isDir: isDirAt,
      onCopied: tree.refresh,
    });

    const dropTargetDir = dnd.dropTargetDir ?? fileDrop.externalTargetDir;
    const rootIsDropTarget =
      dropTargetDir != null && dropTargetDir === rootPath;
    useEffect(() => {
      if (!dropTargetDir || dropTargetDir === rootPath) return;
      if (tree.expanded.has(dropTargetDir)) return;
      const id = window.setTimeout(() => tree.expand(dropTargetDir), 700);
      return () => window.clearTimeout(id);
    }, [dropTargetDir, rootPath, tree.expanded, tree.expand]);

    useEffect(() => {
      if (selectedPath && !entryIndexByPath.has(selectedPath)) {
        setSelectedPath(null);
      }
    }, [entryIndexByPath, selectedPath]);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: OVERSCAN,
      getItemKey: (index) => rows[index]?.key ?? index,
    });

    const scrollEntryIntoView = useCallback(
      (path: string) => {
        const index = entryIndexByPath.get(path);
        if (index === undefined) return;
        virtualizer.scrollToIndex(index, { align: "auto" });
      },
      [entryIndexByPath, virtualizer],
    );

    const lastSyncedActivePathRef = useRef<string | null>(null);
    useEffect(() => {
      if (
        !activeFilePath ||
        activeFilePath === lastSyncedActivePathRef.current
      ) {
        return;
      }
      if (!entryIndexByPath.has(activeFilePath)) return;
      lastSyncedActivePathRef.current = activeFilePath;
      setSelectedPath(activeFilePath);
      requestAnimationFrame(() => scrollEntryIntoView(activeFilePath));
    }, [activeFilePath, entryIndexByPath, scrollEntryIntoView]);

    // Fresh references for async reveal retries (rows build after the
    // expanded folders load, so the first frames may not have the entry).
    const scrollEntryIntoViewRef = useRef(scrollEntryIntoView);
    scrollEntryIntoViewRef.current = scrollEntryIntoView;
    const entryIndexByPathRef = useRef(entryIndexByPath);
    entryIndexByPathRef.current = entryIndexByPath;

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          containerRef.current?.focus();
          if (!selectedPath && entryPaths.length > 0) {
            const first = entryPaths[0];
            setSelectedPath(first);
            requestAnimationFrame(() => scrollEntryIntoView(first));
          }
        },
        isFocused: () => {
          const c = containerRef.current;
          if (!c) return false;
          const active = document.activeElement;
          return active instanceof Node && c.contains(active);
        },
        focusSearch: () => {
          setIsSearchOpen(true);
          searchRef.current?.focus();
        },
        revealPath: (path: string) => {
          if (!rootPath || !isUnder(path, rootPath)) return;
          if (path !== rootPath) {
            // Roots ending in "/" (filesystem root) must not double the
            // separator while walking segments.
            const prefix = rootPath.endsWith("/") ? rootPath : `${rootPath}/`;
            let acc = rootPath;
            for (const seg of path.slice(prefix.length).split("/")) {
              acc = acc.endsWith("/") ? `${acc}${seg}` : `${acc}/${seg}`;
              tree.expand(acc);
            }
            setSelectedPath(path);
          }
          // Children load asynchronously; retry until the row exists.
          let tries = 0;
          const tick = () => {
            if (entryIndexByPathRef.current.has(path)) {
              scrollEntryIntoViewRef.current(path);
              return;
            }
            if (++tries < 40) window.setTimeout(tick, 25);
          };
          tick();
        },
      }),
      [entryPaths, scrollEntryIntoView, selectedPath, rootPath, tree.expand],
    );

    useExplorerShortcuts({
      "explorer.search": () => {
        if (searchRef.current?.isFocused()) {
          setIsSearchOpen(false);
          return;
        }
        setIsSearchOpen(true);
        searchRef.current?.focus();
      },
    });

    // Not a stateful hook: builds the keydown handler from current tree state.
    // Called above the early return so it stays at the component's top level.
    const handleKeyDown = useExplorerKeyboardNav({
      rows,
      entryIndexByPath,
      entryPaths,
      selectedPath,
      setSelectedPath,
      scrollEntryIntoView,
      toggle: tree.toggle,
      onOpenFile,
      rootPath,
      renaming: tree.renaming,
      pendingCreate: tree.pendingCreate,
      isSearchOpen,
    });

    if (!rootPath) {
      return <ExplorerEmptyState />;
    }

    const root = tree.nodes[rootPath];
    const pendingAtRoot =
      tree.pendingCreate?.parentPath === rootPath ? tree.pendingCreate : null;

    return (
      <div
        ref={containerRef}
        className="termco-panel flex h-full flex-col outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <ExplorerHeader
          rootPath={rootPath}
          onToggleSearch={() => setIsSearchOpen((v) => !v)}
          onNewFile={() => tree.beginCreate(rootPath, "file")}
          onNewFolder={() => tree.beginCreate(rootPath, "dir")}
          onRefresh={() => tree.refresh(rootPath)}
        />

        <ExplorerSearch
          ref={searchRef}
          rootPath={rootPath}
          env={env}
          onOpenFile={onOpenFile}
          open={isSearchOpen}
          onRequestClose={() => setIsSearchOpen(false)}
          onActiveChange={setIsSearchActive}
          onRevealInTerminal={onRevealInTerminal}
          onAttachToAgent={onAttachToAgent}
        />

        {!isSearchActive ? (
          <ContextMenu
            onOpenChange={(open) => {
              if (!open) setDeleteConfirm(false);
            }}
          >
            <ContextMenuTrigger asChild>
              <div
                ref={scrollRef}
                data-explorer-drop=""
                className={cn(
                  "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]",
                  rootIsDropTarget &&
                    "rounded-sm ring-1 ring-inset ring-primary/50",
                )}
                onPointerDown={dnd.onPointerDown}
                onClickCapture={dnd.onClickCapture}
                onContextMenuCapture={(e) => {
                  const el = (e.target as HTMLElement).closest<HTMLElement>(
                    "[data-fs-path]",
                  );
                  const path = el?.getAttribute("data-fs-path") ?? null;
                  const idx =
                    path != null ? entryIndexByPath.get(path) : undefined;
                  const row = idx !== undefined ? rows[idx] : undefined;
                  setMenuTarget(
                    row && row.kind === "entry"
                      ? { path: row.path, name: row.name, isDir: row.isDir }
                      : null,
                  );
                  setDeleteConfirm(false);
                  setMenuNonce((n) => n + 1);
                }}
              >
                <ExplorerTreeBody
                  root={root}
                  pendingAtRoot={pendingAtRoot}
                  virtualizer={virtualizer}
                  rows={rows}
                  rowActions={rowActions}
                  renameInProgress={renameInProgress}
                  selectedPath={selectedPath}
                  dropTargetDir={dropTargetDir}
                  gitDecorations={gitDecorations}
                  onOpenFile={onOpenFile}
                  onSelectPath={setSelectedPath}
                  onCommitCreate={tree.commitCreate}
                  onCancelCreate={tree.cancelCreate}
                />
              </div>
            </ContextMenuTrigger>
            <ExplorerContextMenu
              key={menuNonce}
              menuTarget={menuTarget}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
              rootPath={rootPath}
              renameInProgress={renameInProgress}
              onOpenFile={onOpenFile}
              onRevealInTerminal={onRevealInTerminal}
              onAttachToAgent={onAttachToAgent}
              beginCreate={tree.beginCreate}
              deletePath={tree.deletePath}
              refresh={tree.refresh}
            />
          </ContextMenu>
        ) : null}

        {dnd.dragLabel ? (
          <div
            ref={dnd.ghostRef}
            className="pointer-events-none fixed left-0 top-0 z-50 flex items-center gap-1.5 rounded-[6px] border border-border/70 bg-card/95 px-2 py-1 text-xs text-foreground shadow-[var(--shadow-popover)]"
          >
            {dnd.dragLabel}
          </div>
        ) : null}
      </div>
    );
  }),
);
