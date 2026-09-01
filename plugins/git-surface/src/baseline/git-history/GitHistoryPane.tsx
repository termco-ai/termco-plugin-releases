/**
 * Git history pane: a virtualised, paginated commit list with a per-commit
 * detail popover (metadata, remote link, and changed files).
 *
 * This is the thin container that wires the module's hooks and presentational
 * components together. Data loading lives in {@link useCommitLog}, the graph
 * layout in {@link useCommitGraph}, the file cache in {@link useCommitFiles},
 * and header-driven filtering in {@link useHistorySearch}; the rows and popover
 * are rendered by the `components/` sub-components.
 */
import { Button } from "@termco/ui";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@termco/ui";
import { Spinner } from "@termco/ui";
import { TooltipProvider } from "@termco/ui";
import {
  type GitCommitFileChange,
  type GitLogEntry,
  native,
  writeClipboardText,
} from "../../runtime";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CenterPlaceholder } from "./components/CenterPlaceholder";
import { CommitDetail } from "./components/CommitDetail";
import { CommitRow } from "./components/CommitRow";
import { useCommitFiles } from "./hooks/useCommitFiles";
import { useCommitGraph } from "./hooks/useCommitGraph";
import { useCommitLog } from "./hooks/useCommitLog";
import { useHistorySearch } from "./hooks/useHistorySearch";
import {
  GRID_TEMPLATE,
  NEAR_BOTTOM_PX,
  TABLE_HEADER_HEIGHT,
} from "./lib/constants";
import { parseRemoteWebUrl, type RemoteWebInfo } from "./lib/remoteWebUrl";
import type { CommitFileDiffOpenInput, GitHistorySearchHandle } from "./types";

export type { GitHistorySearchHandle } from "./types";

type Props = {
  repoRoot: string;
  workspace?: WorkspaceEnv;
  onOpenCommitFile: (input: CommitFileDiffOpenInput) => void;
  /** Lets the header search bar drive commit filtering for the active pane. */
  onSearchHandle?: (handle: GitHistorySearchHandle | null) => void;
};

export function GitHistoryPane({
  repoRoot,
  workspace,
  onOpenCommitFile,
  onSearchHandle,
}: Props) {
  // TanStack Virtual mutates the virtualizer in place and rerenders after
  // measuring; React Compiler memoization would keep getVirtualItems() stale.
  "use no memo";
  const activeSearch = useHistorySearch(onSearchHandle);

  const [openAnchor, setOpenAnchor] = useState<{
    sha: string;
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [remoteWeb, setRemoteWeb] = useState<RemoteWebInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { openFilesEntry, fetchFiles, resetFiles } = useCommitFiles(
    repoRoot,
    openAnchor?.sha ?? null,
    workspace,
  );
  const {
    commits,
    setCommits,
    loadStatus,
    error,
    endReached,
    loadInitial,
    loadMore,
    filtered,
    virtualizer,
  } = useCommitLog(repoRoot, activeSearch, scrollRef, workspace);
  const { graphByCommit, maxLaneCount } = useCommitGraph(commits);
  const gridTemplate = GRID_TEMPLATE;

  useEffect(() => {
    resetFiles();
    setCommits([]);
    setOpenAnchor(null);
    void loadInitial();
  }, [resetFiles, setCommits, loadInitial]);

  useEffect(() => {
    let cancelled = false;
    const request =
      workspace === undefined
        ? native.gitRemoteUrl(repoRoot)
        : native.gitRemoteUrl(repoRoot, workspace);
    request
      .then((url) => {
        if (cancelled) return;
        setRemoteWeb(parseRemoteWebUrl(url));
      })
      .catch(() => {
        if (cancelled) return;
        setRemoteWeb(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repoRoot, workspace]);

  // Auto-fill: if the list doesn't fill the viewport (no scroll possible)
  // after a load, keep pulling pages until it does or the end is reached.
  // Scheduled async so we don't fight ongoing state transitions.
  useEffect(() => {
    if (loadStatus !== "idle") return;
    if (endReached) return;
    if (activeSearch) return;
    if (commits.length === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    if (scrollable > NEAR_BOTTOM_PX) return;
    const id = window.setTimeout(() => {
      void loadMore();
    }, 0);
    return () => window.clearTimeout(id);
  }, [commits.length, activeSearch, endReached, loadMore, loadStatus]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOpenAnchor((prev) => (prev ? null : prev));
    if (activeSearch) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining < NEAR_BOTTOM_PX) {
      void loadMore();
    }
  }, [activeSearch, loadMore]);

  const handleRefresh = useCallback(() => {
    resetFiles();
    void loadInitial();
  }, [resetFiles, loadInitial]);

  const handleRowClick = useCallback(
    (sha: string, event: React.MouseEvent<HTMLElement>) => {
      if (openAnchor?.sha === sha) {
        setOpenAnchor(null);
        return;
      }
      // Anchor at the cursor so the popover opens where the user clicked,
      // but clamp X so it never gets pushed off-screen on the right.
      const POPOVER_WIDTH = 420;
      const PADDING = 16;
      const maxLeft = window.innerWidth - POPOVER_WIDTH - PADDING;
      const left = Math.max(PADDING, Math.min(event.clientX, maxLeft));
      setOpenAnchor({
        sha,
        top: event.clientY,
        left,
        width: 1,
        height: 1,
      });
      void fetchFiles(sha);
    },
    [fetchFiles, openAnchor?.sha],
  );

  const closePopover = useCallback(() => setOpenAnchor(null), []);

  const handleFileOpen = useCallback(
    (commit: GitLogEntry, file: GitCommitFileChange) => {
      onOpenCommitFile({
        repoRoot,
        sha: commit.sha,
        shortSha: commit.shortSha,
        subject: commit.subject,
        path: file.path,
        originalPath: file.originalPath,
      });
      setOpenAnchor(null);
    },
    [onOpenCommitFile, repoRoot],
  );

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await writeClipboardText(value);
    } catch {
      /* noop */
    }
  }, []);

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={200}>
      <div className="termco-workspace flex h-full min-h-0 flex-col [contain:layout_style]">
        {loadStatus === "initial" && commits.length === 0 ? (
          <CenterPlaceholder>
            <Spinner className="size-4" />
            <span className="text-xs text-muted-foreground">
              Loading commits…
            </span>
          </CenterPlaceholder>
        ) : loadStatus === "error" && commits.length === 0 ? (
          <CenterPlaceholder>
            <div className="text-sm font-medium">Could not load history</div>
            <div className="max-w-md text-xs leading-relaxed text-muted-foreground">
              {error ?? "Unknown error"}
            </div>
            <Button size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </CenterPlaceholder>
        ) : commits.length === 0 ? (
          <CenterPlaceholder>
            <div className="text-sm font-medium">No commits yet</div>
            <div className="max-w-md text-xs leading-relaxed text-muted-foreground">
              This branch has no commits.
            </div>
          </CenterPlaceholder>
        ) : (
          <>
            <div
              className="termco-toolbar grid shrink-0 items-center gap-3 border-b border-border/70 pr-3 font-mono text-xs font-semibold tracking-[0.06em] text-muted-foreground/70"
              style={{
                height: TABLE_HEADER_HEIGHT,
                gridTemplateColumns: gridTemplate,
              }}
            >
              <div />
              <div className="pl-px">SHA</div>
              <div className="min-w-0">Subject</div>
              <div />
              <div className="ml-2">Author</div>
              <div className="text-right">Date</div>
              <div className="text-right">Changes</div>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]"
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const commit = filtered[virtualRow.index];
                  if (!commit) return null;
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
                      <CommitRow
                        commit={commit}
                        query={activeSearch}
                        active={openAnchor?.sha === commit.sha}
                        graphRow={graphByCommit.get(commit.sha) ?? null}
                        maxLaneCount={maxLaneCount}
                        gridTemplate={gridTemplate}
                        onClick={handleRowClick}
                      />
                    </div>
                  );
                })}
              </div>

              {loadStatus === "more" ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  Loading more…
                </div>
              ) : null}
              {endReached && !activeSearch ? (
                <div className="py-3 text-center text-xs text-muted-foreground/65">
                  End of history
                </div>
              ) : null}
              {loadStatus === "error" && commits.length > 0 ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-destructive">
                  {error ?? "Failed to load more"}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 cursor-pointer text-xs"
                    onClick={() => void loadMore()}
                  >
                    Retry
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}

        <Popover
          open={!!openAnchor}
          onOpenChange={(next) => {
            if (!next) closePopover();
          }}
        >
          {typeof document !== "undefined"
            ? createPortal(
                <PopoverAnchor asChild>
                  <div
                    aria-hidden
                    style={{
                      position: "fixed",
                      top: openAnchor?.top ?? -9999,
                      left: openAnchor?.left ?? -9999,
                      width: openAnchor?.width ?? 0,
                      height: openAnchor?.height ?? 0,
                      pointerEvents: "none",
                    }}
                  />
                </PopoverAnchor>,
                document.body,
              )
            : null}
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={4}
            alignOffset={0}
            collisionPadding={16}
            avoidCollisions
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="flex w-[420px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-xl"
          >
            {openAnchor
              ? (() => {
                  const commit = commits.find((c) => c.sha === openAnchor.sha);
                  if (!commit) return null;
                  return (
                    <CommitDetail
                      commit={commit}
                      filesEntry={openFilesEntry}
                      remoteWeb={remoteWeb}
                      onCopySha={copyToClipboard}
                      onOpenFile={handleFileOpen}
                      onRetryFiles={() => void fetchFiles(openAnchor.sha)}
                    />
                  );
                })()
              : null}
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
