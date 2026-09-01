import { Button, IS_MAC, TooltipProvider } from "@termco/ui";
import { ArrowRight01Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChangedFileList } from "./components/ChangedFileList";
import { CleanTreeHint } from "./components/CleanTreeHint";
import { CommitComposer } from "./components/CommitComposer";
import { DiscardDialog } from "./components/DiscardDialog";
import { PanelCenter } from "./components/PanelCenter";
import { PanelHeader } from "./components/PanelHeader";
import { usePanelRows } from "./hooks/usePanelRows";
import { upstreamBadgeLabel } from "./lib/rowHelpers";
import type { SourceControlSummary } from "./useSourceControl";
import { useSourceControlPanel } from "./useSourceControlPanel";

type Props = {
  open: boolean;
  sourceControl: SourceControlSummary;
  onOpenGitGraph?: () => void;
  onOpenDiff: (input: {
    path: string;
    repoRoot: string;
    mode: "+" | "-";
    originalPath: string | null;
    title?: string;
  }) => void;
  onOpenFile?: (absolutePath: string) => void;
  onNavigateToPath?: (path: string) => void;
};

export const SourceControlPanel = memo(function SourceControlPanel({
  open,
  sourceControl,
  onOpenGitGraph,
  onOpenDiff,
  onOpenFile,
  onNavigateToPath,
}: Props) {
  // usePanelRows' virtualizer rerenders this component after measuring; a
  // compiler-cached ChangedFileList element would swallow that rerender and
  // keep the child's getVirtualItems() output stale.
  "use no memo";
  const scm = useSourceControlPanel(open, sourceControl, onOpenDiff);
  const refreshAnimationRef = useRef<number | null>(null);
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedRowKey, setFocusedRowKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (refreshAnimationRef.current) {
        window.clearTimeout(refreshAnimationRef.current);
      }
    };
  }, []);

  const isRefreshing = scm.panelState === "loading";
  const repoLabel = useMemo(() => {
    if (!scm.status) return "Source Control";
    return scm.status.isDetached ? "detached" : scm.status.branch;
  }, [scm.status]);

  const commitShortcut = IS_MAC ? "⌘↩" : "Ctrl+Enter";
  const generateShortcut = IS_MAC ? "⌘G" : "Ctrl+G";
  const canCommit =
    scm.stagedEntries.length > 0 &&
    scm.commitMessage.trim().length > 0 &&
    !scm.actionBusy;
  const commitDisabledReason = scm.actionBusy
    ? "Wait for the current Git action to finish."
    : scm.stagedEntries.length === 0
      ? "Stage changes to enable commit."
      : scm.commitMessage.trim().length === 0
        ? "Enter a commit message to enable commit."
        : null;
  const commitHint = canCommit
    ? `Commit with ${commitShortcut}.`
    : (commitDisabledReason ?? `Commit with ${commitShortcut}.`);
  const pushHint = scm.pushHint ?? "Push is unavailable right now.";
  const pushDisabledReason = scm.actionBusy
    ? "Wait for the current Git action to finish."
    : pushHint;
  const stagedCount = scm.stagedEntries.length;
  const changedCount = scm.fileEntries.length;
  const pushStatusLabel = upstreamBadgeLabel(scm.status?.upstream);
  const hasUpstream = !!scm.status?.upstream;
  const isDiverged =
    !!scm.status && scm.status.ahead > 0 && scm.status.behind > 0;

  const canPull =
    hasUpstream &&
    !!scm.status &&
    scm.status.behind > 0 &&
    !isDiverged &&
    !scm.actionBusy &&
    !sourceControl.busyAction;
  const canFetch = hasUpstream && !scm.actionBusy && !sourceControl.busyAction;

  const footerFeedback = useMemo(() => {
    if (scm.actionError)
      return { tone: "error", message: scm.actionError } as const;
    if (scm.remoteError)
      return { tone: "error", message: scm.remoteError } as const;
    if (scm.actionMessage)
      return { tone: "success", message: scm.actionMessage } as const;
    return null;
  }, [scm.actionError, scm.actionMessage, scm.remoteError]);

  const handleCommitShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      canCommit
    ) {
      event.preventDefault();
      void scm.commit();
      return;
    }
    if (
      event.key.toLowerCase() === "g" &&
      (event.metaKey || event.ctrlKey) &&
      scm.canGenerateCommitMessage
    ) {
      event.preventDefault();
      void scm.generateCommitMessage();
    }
  };

  const handleRefresh = useCallback(() => {
    setRefreshAnimating(true);
    if (refreshAnimationRef.current) {
      window.clearTimeout(refreshAnimationRef.current);
    }
    void scm.refresh().finally(() => {
      refreshAnimationRef.current = window.setTimeout(() => {
        setRefreshAnimating(false);
        refreshAnimationRef.current = null;
      }, 450);
    });
  }, [scm]);

  const handleFetch = useCallback(() => {
    void sourceControl.runRemoteAction("fetch");
  }, [sourceControl]);

  const handlePull = useCallback(() => {
    void sourceControl.runRemoteAction("pull");
  }, [sourceControl]);

  const { rows, virtualizer, handlePanelKeyDown } = usePanelRows(scm, {
    isDiverged,
    changedCount,
    scrollRef,
    focusedRowKey,
    setFocusedRowKey,
    handleRefresh,
  });

  if (!open) return null;

  const fetchBusy = sourceControl.busyAction === "fetch";
  const pullBusy = sourceControl.busyAction === "pull";

  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={300}>
      <aside className="termco-panel flex h-full min-w-0 flex-col [contain:layout_style]">
        <PanelHeader
          repoRoot={scm.repo?.repoRoot ?? null}
          status={scm.status}
          repoLabel={repoLabel}
          actionBusy={scm.actionBusy}
          isRefreshing={isRefreshing}
          refreshAnimating={refreshAnimating}
          canFetch={canFetch}
          canPull={canPull}
          fetchBusy={fetchBusy}
          pullBusy={pullBusy}
          hasUpstream={hasUpstream}
          isDiverged={isDiverged}
          onNavigateToPath={onNavigateToPath}
          onRefresh={handleRefresh}
          onFetch={handleFetch}
          onPull={handlePull}
        />

        {onOpenGitGraph ? (
          <button
            type="button"
            onClick={() => onOpenGitGraph()}
            className="termco-toolbar group flex shrink-0 cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon
              icon={GitBranchIcon}
              size={13}
              strokeWidth={1.85}
              className="shrink-0"
            />
            <span className="flex-1 text-xs font-medium">Commit Graph</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={12}
              strokeWidth={2}
              className="shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5"
            />
          </button>
        ) : null}

        {scm.panelState === "loading" ? (
          <PanelCenter title="Loading repository" />
        ) : null}

        {scm.panelState === "no-repo" ? (
          <PanelCenter
            title="No repository"
            body="The active workspace is not inside a Git repository."
          />
        ) : null}

        {scm.panelState === "error" ? (
          <PanelCenter
            title="Source control error"
            body={scm.statusError ?? "Unknown source control error"}
            action={
              <Button size="sm" onClick={() => void scm.refresh()}>
                Retry
              </Button>
            }
          />
        ) : null}

        {scm.panelState === "ready" && scm.status ? (
          <>
            <CommitComposer
              commitMessage={scm.commitMessage}
              setCommitMessage={scm.setCommitMessage}
              onCommitKeyDown={handleCommitShortcut}
              commitShortcut={commitShortcut}
              generateShortcut={generateShortcut}
              generateCommitMessageHint={scm.generateCommitMessageHint}
              canGenerateCommitMessage={scm.canGenerateCommitMessage}
              actionBusy={scm.actionBusy}
              onGenerateCommitMessage={scm.generateCommitMessage}
              canCommit={canCommit}
              commitHint={commitHint}
              onCommit={scm.commit}
              canPush={scm.canPush}
              pushDisabledReason={pushDisabledReason}
              onPush={scm.push}
              stagedCount={stagedCount}
              pushStatusLabel={pushStatusLabel}
              footerFeedback={footerFeedback}
            />

            {scm.allClean ? (
              <CleanTreeHint repoLabel={repoLabel} />
            ) : (
              <ChangedFileList
                containerRef={containerRef}
                scrollRef={scrollRef}
                focusedRowKey={focusedRowKey}
                setFocusedRowKey={setFocusedRowKey}
                onKeyDown={handlePanelKeyDown}
                virtualizer={virtualizer}
                rows={rows}
                selectedPath={scm.selected?.path ?? null}
                actionBusy={scm.actionBusy}
                headerCheckState={scm.headerCheckState}
                repoRoot={scm.repo?.repoRoot ?? null}
                onToggleAll={scm.toggleAll}
                onSelectFile={scm.selectFile}
                onToggleStageFile={scm.toggleStageFile}
                onDiscardFile={scm.requestDiscardFile}
                onOpenFile={onOpenFile}
              />
            )}
          </>
        ) : null}
      </aside>

      <DiscardDialog
        pendingDiscard={scm.pendingDiscard}
        onCancel={scm.cancelPendingDiscard}
        onConfirm={scm.confirmPendingDiscard}
      />
    </TooltipProvider>
  );
});
