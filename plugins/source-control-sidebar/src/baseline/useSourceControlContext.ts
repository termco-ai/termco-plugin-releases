import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback, useMemo } from "react";
import { native } from "../runtime";
import { useSourceControl } from "./useSourceControl";

type ContextTab = {
  kind: string;
  path?: string;
  repoRoot?: string;
};

function dirname(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

type Params = {
  activeTab: ContextTab | undefined;
  tabs: ContextTab[];
  workspace?: WorkspaceEnv;
  activeTerminalLeafCwd: string | null;
  explorerRoot: string | null;
  launchCwd: string | null;
  launchCwdResolved: boolean;
  home: string | null;
  sidebarView: string;
  cycleSidebarView: (view: string) => void;
  openCommitHistoryTab: (args: {
    repoRoot: string;
    branch: string | null;
  }) => void;
};

/**
 * Resolves the source-control context path off the active tab and feeds the
 * source-control summary. When git is not active the badge tracks a stable
 * per-session path so tab switches / cd don't re-fire git IPC.
 */
export function useSourceControlContext({
  activeTab,
  tabs,
  activeTerminalLeafCwd,
  explorerRoot,
  launchCwd,
  launchCwdResolved,
  home,
  workspace,
  sidebarView,
  cycleSidebarView,
  openCommitHistoryTab,
}: Params) {
  const workspaceFallbackPath = launchCwdResolved
    ? (launchCwd ?? home ?? null)
    : null;
  const sourceControlContextPath = (() => {
    if (activeTab?.kind === "terminal") {
      return activeTerminalLeafCwd ?? explorerRoot ?? workspaceFallbackPath;
    }
    if (activeTab?.kind === "editor") return dirname(activeTab.path ?? null);
    if (activeTab?.kind === "git-diff") return activeTab.repoRoot ?? null;
    if (activeTab?.kind === "git-commit-file") return activeTab.repoRoot ?? null;
    if (activeTab?.kind === "git-history") return activeTab.repoRoot ?? null;
    return explorerRoot ?? workspaceFallbackPath;
  })();
  const hasOpenGitTab = useMemo(
    () =>
      tabs.some(
        (t) =>
          t.kind === "git-diff" ||
          t.kind === "git-history" ||
          t.kind === "git-commit-file",
      ),
    [tabs],
  );
  const sourceControlActive = hasOpenGitTab || sidebarView === "source-control";
  // Ambient path tracks the explorer root so the rail badge and explorer git
  // decorations reflect the repo you are actually looking at. cd-within-repo
  // churn is absorbed by the status TTL + reusable-root path in useSourceControl.
  const badgeContextPath = explorerRoot ?? workspaceFallbackPath;
  const sourceControlPath = sourceControlActive
    ? sourceControlContextPath
    : badgeContextPath;
  const sourceControl = useSourceControl(
    sourceControlPath ?? null,
    workspace ?? { kind: "local" },
    true,
  );

  const toggleSourceControl = useCallback(() => {
    cycleSidebarView("source-control");
  }, [cycleSidebarView]);

  const openGitGraphFromContext = useCallback(async () => {
    const known = sourceControl.hasRepo ? sourceControl.repo : null;
    if (known) {
      openCommitHistoryTab({
        repoRoot: known.repoRoot,
        branch: sourceControl.status?.branch ?? null,
      });
      return;
    }
    if (!sourceControlContextPath) return;
    try {
      const repo = await native.gitResolveRepo(sourceControlContextPath);
      if (!repo) return;
      openCommitHistoryTab({ repoRoot: repo.repoRoot, branch: repo.branch });
    } catch {
      /* noop */
    }
  }, [
    openCommitHistoryTab,
    sourceControl.hasRepo,
    sourceControl.repo,
    sourceControl.status?.branch,
    sourceControlContextPath,
  ]);

  return { sourceControl, toggleSourceControl, openGitGraphFromContext };
}
