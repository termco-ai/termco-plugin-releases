/**
 * A single file/folder row in the explorer tree.
 * Renders the disclosure chevron, icon and name, and swaps to an inline
 * rename input while a rename is in progress. Split out of the former
 * `TreeRow.tsx`; the shared `RowActions` contract lives here.
 */
import { cn } from "../../ui";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { explorerGitTextClass } from "../lib/gitStatusColor";
import type { GitStatusCode } from "../lib/gitStatusUtils";
import { fileIconUrl, folderIconUrl } from "../lib/iconResolver";
import { InlineInput } from "./InlineInput";

export type RowActions = {
  toggle: (path: string) => void;
  beginRename: (path: string) => void;
  commitRename: (newName: string) => void | Promise<void>;
  cancelRename: () => void;
};

export type EntryRowProps = {
  path: string;
  name: string;
  isDir: boolean;
  isExpanded: boolean;
  depth: number;
  actions: RowActions;
  renameInProgress: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  isDropTarget?: boolean;
  onOpenFile: (path: string, pin?: boolean) => void;
  onSelectPath: (path: string) => void;
  gitStatusCode?: GitStatusCode | null;
  gitignored?: boolean;
};

function EntryRowImpl(props: EntryRowProps) {
  const {
    path,
    name,
    isDir,
    isExpanded,
    depth,
    actions,
    renameInProgress,
    isSelected,
    isRenaming,
    isDropTarget = false,
    onOpenFile,
    onSelectPath,
    gitStatusCode,
    gitignored = false,
  } = props;

  const iconUrl = isDir ? folderIconUrl(name, isExpanded) : fileIconUrl(name);
  const paddingLeft = 6 + depth * 12;

  if (isRenaming) {
    return (
      <div
        className="flex h-7 w-full min-w-0 items-center gap-2 px-1.5 text-sm"
        style={{ paddingLeft }}
      >
        <span className="size-3.5 shrink-0" />
        {iconUrl ? (
          <img src={iconUrl} alt="" className="size-4 shrink-0" />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <InlineInput
          initial={name}
          onCommit={actions.commitRename}
          onCancel={actions.cancelRename}
        />
      </div>
    );
  }

  const handleClick = () => {
    if (renameInProgress) return;
    onSelectPath(path);
    if (isDir) actions.toggle(path);
    else onOpenFile(path);
  };

  return (
    <button
      type="button"
      data-fs-path={path}
      onClick={handleClick}
      onDoubleClick={() => !isDir && actions.beginRename(path)}
      className={cn(
        "group relative flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] px-1.5 text-left text-sm transition-colors hover:bg-accent/70",
        isSelected
          ? "bg-[var(--signal-soft)] text-foreground before:absolute before:left-0 before:h-3.5 before:w-px before:rounded-full before:bg-primary"
          : gitignored
            ? "text-muted-foreground/70"
            : "text-foreground/85",
        isDropTarget && "bg-primary/10 ring-1 ring-inset ring-primary/60",
      )}
      style={{ paddingLeft }}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {isDir ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={12}
            strokeWidth={2.25}
            className={cn("transition-transform", isExpanded && "rotate-90")}
          />
        ) : null}
      </span>
      {iconUrl ? (
        <img src={iconUrl} alt="" className="size-4 shrink-0" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          !isSelected &&
            !gitignored &&
            gitStatusCode &&
            explorerGitTextClass(gitStatusCode),
        )}
      >
        {name}
      </span>
    </button>
  );
}

export const EntryRow = memo(EntryRowImpl);
