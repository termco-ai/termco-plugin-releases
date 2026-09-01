/**
 * Changed-files section of a commit's detail popover.
 *
 * Renders the loading / error / empty states of the per-commit file cache,
 * and otherwise a scrollable list of {@link FileRow}s with a count badge.
 */
import { Button } from "@termco/ui";
import { Spinner } from "@termco/ui";
import type { GitCommitFileChange, GitLogEntry } from "../../../runtime";
import type { FilesEntry } from "../types";
import { FileRow } from "./FileRow";

/**
 * Render the file list for `commit` from its cache `filesEntry`.
 *
 * @param onOpenFile Invoked with the commit + file when a row is clicked.
 * @param onRetry Invoked to refetch after an error entry.
 */
export function CommitFiles({
  commit,
  filesEntry,
  onOpenFile,
  onRetry,
}: {
  commit: GitLogEntry;
  filesEntry: FilesEntry | null;
  onOpenFile: (
    commit: GitLogEntry,
    file: GitCommitFileChange,
  ) => Promise<void> | void;
  onRetry: () => void;
}) {
  if (!filesEntry || filesEntry.state === "loading") {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Loading files…
      </div>
    );
  }
  if (filesEntry.state === "error") {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-destructive">
        <span className="truncate">{filesEntry.error}</span>
        <Button
          size="xs"
          variant="ghost"
          className="h-6 cursor-pointer text-xs"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (filesEntry.files.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-muted-foreground">
        No file changes.
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/85">
        <span>Files</span>
        <span className="rounded-sm bg-muted/55 px-1 py-px text-xs tabular-nums text-muted-foreground/85 normal-case tracking-normal">
          {filesEntry.files.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        <ul className="space-y-px px-1.5 pb-2">
          {filesEntry.files.map((file) => (
            <li key={file.path}>
              <FileRow
                file={file}
                onOpen={() => void onOpenFile(commit, file)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
