/**
 * Scrollable body of the explorer: the root-level pending-create input, the
 * root load/error states, and the virtualized list of tree rows.
 *
 * Rendered as the children of the `ContextMenuTrigger`'s scroll container in
 * {@link FileExplorer} (which stays inline so Radix's `asChild` ref/prop
 * merging is preserved). Owns per-row rendering via the local `renderRow`.
 */

import type { Virtualizer } from "@tanstack/react-virtual";
import type { Row } from "../lib/buildRows";
import type { ChildrenState, PendingCreate } from "../lib/useFileTree/types";
import { EntryRow, type RowActions } from "./EntryRow";
import { PendingRootRow } from "./PendingRootRow";
import { PendingRow } from "./PendingRow";
import { StatusRow } from "./StatusRow";

type Props = {
  root: ChildrenState | undefined;
  pendingAtRoot: PendingCreate | null;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  rows: Row[];
  rowActions: RowActions;
  renameInProgress: boolean;
  selectedPath: string | null;
  dropTargetDir: string | null;
  gitDecorations: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onSelectPath: (path: string | null) => void;
  onCommitCreate: (name: string) => void;
  onCancelCreate: () => void;
};

/** Inner content of the explorer scroll container. */
export function ExplorerTreeBody({
  root,
  pendingAtRoot,
  virtualizer,
  rows,
  rowActions,
  renameInProgress,
  selectedPath,
  dropTargetDir,
  gitDecorations,
  onOpenFile,
  onSelectPath,
  onCommitCreate,
  onCancelCreate,
}: Props) {
  // TanStack Virtual mutates the virtualizer in place and rerenders after
  // measuring; React Compiler memoization would keep getVirtualItems() stale.
  "use no memo";
  const renderRow = (row: Row) => {
    switch (row.kind) {
      case "entry":
      case "rename": {
        return (
          <EntryRow
            path={row.path}
            name={row.name}
            isDir={row.isDir}
            isExpanded={row.kind === "entry" ? row.isExpanded : false}
            depth={row.depth}
            actions={rowActions}
            renameInProgress={renameInProgress}
            isSelected={selectedPath === row.path}
            isRenaming={row.kind === "rename"}
            isDropTarget={dropTargetDir === row.path}
            onOpenFile={onOpenFile}
            onSelectPath={onSelectPath}
            gitStatusCode={row.gitStatusCode}
            gitignored={gitDecorations && row.gitignored}
          />
        );
      }
      case "pending":
        return (
          <PendingRow
            depth={row.depth}
            kind={row.pendingKind}
            onCommit={onCommitCreate}
            onCancel={onCancelCreate}
          />
        );
      case "status":
        return (
          <StatusRow depth={row.depth} message={row.message} tone={row.tone} />
        );
    }
  };

  return (
    <>
      {pendingAtRoot ? (
        <PendingRootRow
          kind={pendingAtRoot.kind}
          onCommit={onCommitCreate}
          onCancel={onCancelCreate}
        />
      ) : null}
      {root?.status === "loading" && (
        <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
      )}
      {root?.status === "error" && (
        <div className="px-3 py-2 text-xs text-destructive">{root.message}</div>
      )}
      {root?.status === "loaded" ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={virtualRow.key}
                data-virtual-row-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
