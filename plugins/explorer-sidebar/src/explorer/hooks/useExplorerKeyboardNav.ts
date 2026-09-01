/**
 * Keyboard navigation for the explorer tree.
 *
 * Returns the `onKeyDown` handler wired to the container: arrow keys move the
 * selection (and scroll it into view), Left/Right collapse/expand or hop to the
 * parent, and Enter toggles a folder or opens a file. Input is suppressed while
 * a rename/create input or the search box is active, or when focus is inside a
 * form field.
 */

import type { KeyboardEvent } from "react";
import type { Row } from "../lib/buildRows";
import type { PendingCreate } from "../lib/useFileTree";

type Params = {
  rows: Row[];
  entryIndexByPath: Map<string, number>;
  entryPaths: string[];
  selectedPath: string | null;
  setSelectedPath: (path: string) => void;
  scrollEntryIntoView: (path: string) => void;
  toggle: (path: string) => void;
  onOpenFile: (path: string, pin?: boolean) => void;
  rootPath: string | null;
  renaming: string | null;
  pendingCreate: PendingCreate | null;
  isSearchOpen: boolean;
};

/** Build the explorer's keydown handler from current tree/selection state. */
export function useExplorerKeyboardNav({
  rows,
  entryIndexByPath,
  entryPaths,
  selectedPath,
  setSelectedPath,
  scrollEntryIntoView,
  toggle,
  onOpenFile,
  rootPath,
  renaming,
  pendingCreate,
  isSearchOpen,
}: Params): (e: KeyboardEvent<HTMLDivElement>) => void {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming || pendingCreate || isSearchOpen) return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    )
      return;
    if (entryPaths.length === 0) return;

    const currentIdx = selectedPath ? entryPaths.indexOf(selectedPath) : -1;
    const move = (next: number) => {
      const clamped = Math.max(0, Math.min(entryPaths.length - 1, next));
      const path = entryPaths[clamped];
      setSelectedPath(path);
      requestAnimationFrame(() => scrollEntryIntoView(path));
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(currentIdx < 0 ? 0 : currentIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(currentIdx < 0 ? entryPaths.length - 1 : currentIdx - 1);
        break;
      case "ArrowRight": {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const idx = entryIndexByPath.get(path);
        if (idx === undefined) break;
        const row = rows[idx];
        if (row.kind !== "entry") break;
        if (row.isDir) {
          if (!row.isExpanded) toggle(row.path);
          else move(currentIdx + 1);
        }
        break;
      }
      case "ArrowLeft": {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const idx = entryIndexByPath.get(path);
        if (idx === undefined) break;
        const row = rows[idx];
        if (row.kind !== "entry") break;
        if (row.isDir && row.isExpanded) {
          toggle(row.path);
        } else {
          const parent = row.path.slice(0, row.path.lastIndexOf("/"));
          if (parent && parent !== rootPath) setSelectedPath(parent);
        }
        break;
      }
      case "Enter": {
        if (currentIdx < 0) return;
        e.preventDefault();
        const path = entryPaths[currentIdx];
        const idx = entryIndexByPath.get(path);
        if (idx === undefined) break;
        const row = rows[idx];
        if (row.kind !== "entry") break;
        if (row.isDir) toggle(row.path);
        else onOpenFile(row.path);
        break;
      }
    }
  };
}
