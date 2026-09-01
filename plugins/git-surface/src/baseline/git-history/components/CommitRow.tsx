/**
 * A single row in the virtualised commit list.
 *
 * Renders the graph rail, short SHA, highlighted subject, author chip, date,
 * and change stats. Memoised because the virtualiser re-renders the container
 * frequently while only a few rows actually change.
 */
import { cn } from "@termco/ui";
import type { GitLogEntry } from "../../../runtime";
import { File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { ROW_HEIGHT } from "../lib/constants";
import { authorInitials, authorTint, compactDate } from "../lib/format";
import type { GraphRow } from "../lib/graph";
import { highlight } from "../lib/highlight";
import { GraphRail } from "./GraphRail";

/** Props for {@link CommitRow}. */
export type CommitRowProps = {
  commit: GitLogEntry;
  query: string;
  active: boolean;
  graphRow: GraphRow | null;
  maxLaneCount: number;
  gridTemplate: string;
  onClick: (sha: string, event: React.MouseEvent<HTMLElement>) => void;
};

/**
 * Render one commit as a clickable grid row; calls `onClick` with the SHA and
 * the originating mouse event so the container can anchor the detail popover.
 */
export const CommitRow = memo(function CommitRow({
  commit,
  query,
  active,
  graphRow,
  maxLaneCount,
  gridTemplate,
  onClick,
}: CommitRowProps) {
  const date = compactDate(commit.timestampSecs);
  const initials = authorInitials(commit.author);
  const totalStat = commit.insertions + commit.deletions;
  return (
    <button
      type="button"
      onClick={(event) => onClick(commit.sha, event)}
      className={cn(
        "group relative grid h-full w-full cursor-pointer items-center gap-3 border-l-2 border-transparent pr-3 text-left transition-colors",
        active ? "border-l-primary/70 bg-accent" : "hover:bg-accent",
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div className="flex items-center justify-start pl-1">
        {graphRow ? (
          <GraphRail
            row={graphRow}
            rowHeight={ROW_HEIGHT}
            maxLaneCount={maxLaneCount}
            active={active}
          />
        ) : null}
      </div>
      <span className="pl-px font-mono text-xs tabular-nums text-muted-foreground">
        {commit.shortSha}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-sm leading-tight",
          active
            ? "font-semibold text-foreground"
            : "font-medium text-foreground/95",
        )}
      >
        {commit.subject ? (
          highlight(commit.subject, query)
        ) : (
          <span className="text-muted-foreground">(no subject)</span>
        )}
      </span>
      <span aria-hidden />
      <span
        className="ml-2 inline-flex max-w-full min-w-0 items-center gap-1.5 justify-self-start self-center overflow-hidden text-xs text-muted-foreground"
        title={commit.authorEmail || commit.author}
      >
        <span
          className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase tabular-nums"
          style={{
            color: authorTint(commit.authorEmail || commit.author),
          }}
        >
          {initials}
        </span>
        <span className="min-w-0 truncate">
          {commit.author ? highlight(commit.author, query) : "Unknown"}
        </span>
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {date}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 font-mono text-xs tabular-nums">
        {commit.filesChanged > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-muted-foreground/75"
            title={`${commit.filesChanged} ${commit.filesChanged === 1 ? "file" : "files"} changed`}
          >
            <HugeiconsIcon
              icon={File02Icon}
              size={10.5}
              strokeWidth={1.7}
              className="opacity-70"
            />
            <span className="font-medium">{commit.filesChanged}</span>
          </span>
        ) : null}
        {commit.filesChanged > 0 && totalStat > 0 ? (
          <span
            aria-hidden
            className="size-[3px] shrink-0 rounded-full bg-muted-foreground/30"
          />
        ) : null}
        {totalStat > 0 ? (
          <span className="inline-flex items-center gap-1">
            {commit.insertions > 0 ? (
              <span className="font-semibold text-chart-5">
                +{commit.insertions}
              </span>
            ) : null}
            {commit.deletions > 0 ? (
              <span className="font-semibold text-destructive">
                -{commit.deletions}
              </span>
            ) : null}
          </span>
        ) : commit.filesChanged === 0 ? (
          <span className="text-muted-foreground/40">-</span>
        ) : null}
      </span>
    </button>
  );
});
