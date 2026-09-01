/**
 * A single changed-file row inside a commit's detail popover.
 *
 * Shows the file icon, name, directory, add/remove counts (or a "binary"
 * badge), and the git status letter. Memoised because a commit can list many
 * files and only the clicked row's identity changes.
 */
import { cn } from "@termco/ui";
import type { GitCommitFileChange } from "../../../runtime";
import { fileIconUrl } from "../../../runtime";
import { memo } from "react";
import { basename, dirname, statusTone } from "../lib/format";

/**
 * Render one changed file; invokes `onOpen` when clicked to open its diff.
 */
export const FileRow = memo(function FileRow({
  file,
  onOpen,
}: {
  file: GitCommitFileChange;
  onOpen: () => void;
}) {
  const fileName = basename(file.path);
  const dir = dirname(file.path);
  const iconUrl = fileIconUrl(fileName);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-accent/40"
    >
      {iconUrl ? (
        <img src={iconUrl} alt="" className="size-3.5 shrink-0" />
      ) : (
        <span className="size-3.5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
        <span className="truncate text-xs font-medium leading-tight">
          {fileName}
        </span>
        {dir ? (
          <span className="min-w-0 flex-1 truncate text-xs leading-tight text-muted-foreground/80">
            {dir}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
        {file.isBinary ? (
          <span className="text-muted-foreground/70">binary</span>
        ) : (
          <>
            {file.added > 0 ? (
              <span className="text-chart-5">+{file.added}</span>
            ) : null}
            {file.removed > 0 ? (
              <span className="text-destructive">-{file.removed}</span>
            ) : null}
          </>
        )}
      </div>
      <span
        className={cn(
          "inline-flex w-4 shrink-0 justify-center text-xs font-bold leading-none tabular-nums",
          statusTone(file.status),
        )}
        title={file.statusLabel}
      >
        {file.status.toUpperCase()}
      </span>
    </button>
  );
});
