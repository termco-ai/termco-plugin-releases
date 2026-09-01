import type { Virtualizer } from "@tanstack/react-virtual";
import type { KeyboardEvent, RefObject } from "react";
import type {
  CheckState,
  SourceControlFileEntry,
} from "../useSourceControlPanel";
import { RowRenderer } from "./RowRenderer";
import type { RowDescriptor } from "./types";

export function ChangedFileList({
  containerRef,
  scrollRef,
  focusedRowKey,
  setFocusedRowKey,
  onKeyDown,
  virtualizer,
  rows,
  selectedPath,
  actionBusy,
  headerCheckState,
  repoRoot,
  onToggleAll,
  onSelectFile,
  onToggleStageFile,
  onDiscardFile,
  onOpenFile,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  focusedRowKey: string | null;
  setFocusedRowKey: (key: string | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  rows: RowDescriptor[];
  selectedPath: string | null;
  actionBusy: string | null;
  headerCheckState: CheckState;
  repoRoot: string | null;
  onToggleAll: () => Promise<void> | void;
  onSelectFile: (entry: SourceControlFileEntry) => Promise<void>;
  onToggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  onDiscardFile: (entry: SourceControlFileEntry) => void;
  onOpenFile?: (absolutePath: string) => void;
}) {
  // TanStack Virtual mutates the virtualizer in place and rerenders after
  // measuring; React Compiler memoization would keep getVirtualItems() stale.
  "use no memo";
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="listbox"
      aria-label="Changed files"
      aria-activedescendant={
        focusedRowKey ? `scm-row-${focusedRowKey}` : undefined
      }
      onKeyDown={onKeyDown}
      className="relative min-h-0 flex-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
    >
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
      >
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
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <RowRenderer
                  row={row}
                  focused={focusedRowKey === row.key}
                  selectedPath={selectedPath}
                  actionBusy={actionBusy}
                  headerCheckState={headerCheckState}
                  repoRoot={repoRoot}
                  onFocusRow={setFocusedRowKey}
                  onToggleAll={onToggleAll}
                  onSelectFile={onSelectFile}
                  onToggleStageFile={onToggleStageFile}
                  onDiscardFile={onDiscardFile}
                  onOpenFile={onOpenFile}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
