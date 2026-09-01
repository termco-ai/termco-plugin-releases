import { Spinner } from "@termco/ui";
import { cn } from "@termco/ui";
import type { GitStatusSnapshot } from "@termco/git-base";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Download01Icon,
  FolderCloudIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BranchDropdown } from "./BranchDropdown";
import { IconActionButton } from "./IconActionButton";

export function PanelHeader({
  repoRoot,
  status,
  repoLabel,
  actionBusy,
  isRefreshing,
  refreshAnimating,
  canFetch,
  canPull,
  fetchBusy,
  pullBusy,
  hasUpstream,
  isDiverged,
  onNavigateToPath,
  onRefresh,
  onFetch,
  onPull,
}: {
  repoRoot: string | null;
  status: GitStatusSnapshot | null;
  repoLabel: string;
  actionBusy: string | null;
  isRefreshing: boolean;
  refreshAnimating: boolean;
  canFetch: boolean;
  canPull: boolean;
  fetchBusy: boolean;
  pullBusy: boolean;
  hasUpstream: boolean;
  isDiverged: boolean;
  onNavigateToPath?: (path: string) => void;
  onRefresh: () => void;
  onFetch: () => void;
  onPull: () => void;
}) {
  return (
    <header className="termco-toolbar flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <BranchDropdown
          repoRoot={repoRoot}
          repoLabel={repoLabel}
          onNavigateToPath={onNavigateToPath}
          onRefresh={onRefresh}
        />
        {status && (status.ahead > 0 || status.behind > 0) ? (
          <div className="flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums leading-none text-muted-foreground">
            {status.ahead > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-border/60 px-1 py-0.5">
                <HugeiconsIcon
                  icon={ArrowUp01Icon}
                  size={9}
                  strokeWidth={2.2}
                />
                {status.ahead}
              </span>
            ) : null}
            {status.behind > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded-md border border-border/60 px-1 py-0.5">
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={9}
                  strokeWidth={2.2}
                />
                {status.behind}
              </span>
            ) : null}
          </div>
        ) : null}
        {status?.isDetached ? (
          <span className="rounded-[6px] bg-muted/55 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            detached
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconActionButton
          label={fetchBusy ? "Fetching…" : "Fetch from remote"}
          disabled={!canFetch}
          onClick={onFetch}
          side="bottom"
        >
          {fetchBusy ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon
              icon={FolderCloudIcon}
              size={14}
              strokeWidth={1.85}
            />
          )}
        </IconActionButton>
        <IconActionButton
          label={
            pullBusy
              ? "Pulling…"
              : isDiverged
                ? "Branch diverged — resolve in terminal"
                : !hasUpstream
                  ? "No upstream configured"
                  : (status?.behind ?? 0) === 0
                    ? "Already up to date"
                    : `Pull ${status?.behind ?? 0} commits (fast-forward)`
          }
          disabled={!canPull}
          onClick={onPull}
          side="bottom"
        >
          {pullBusy ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={1.9} />
          )}
        </IconActionButton>
        <IconActionButton
          label="Refresh source control"
          disabled={isRefreshing || !!actionBusy}
          onClick={onRefresh}
          side="bottom"
        >
          {isRefreshing ? (
            <Spinner className="size-3.5" />
          ) : (
            <HugeiconsIcon
              icon={Refresh01Icon}
              size={14}
              strokeWidth={1.9}
              className={cn(refreshAnimating && "animate-spin")}
            />
          )}
        </IconActionButton>
      </div>
    </header>
  );
}
