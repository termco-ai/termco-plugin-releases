import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  GitCapability,
  SourceControlGraphRequest,
  SourceControlNavigationCapability,
} from "@termco/git-base";
import type { TerminalBlockOpenDiff } from "@termco/terminal-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import type { UiGitDiffRequest } from "@termco/ui-sidebar-base";
import type {
  WorkspaceEnv,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { sourceControlContextPath } from "./context";

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? path;
}

/** Open the selected rig's working-tree diff through the shared tab provider. */
export function openWorkingDiffTab(
  tabs: WorkspaceTabsCapability,
  request: UiGitDiffRequest,
): number {
  const snapshot = tabs.snapshot();
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
  const rigId = active?.rigId ?? snapshot.activeRigIdForNewTabs;
  const existing = snapshot.tabs.find(
    (tab) =>
      tab.kind === "git-diff" &&
      tab.rigId === rigId &&
      tab.data?.repoRoot === request.repoRoot &&
      tab.data?.path === request.path &&
      tab.data?.mode === request.mode,
  );
  const title = request.title ?? `${basename(request.path)} (${request.mode})`;
  const data = {
    repoRoot: request.repoRoot,
    path: request.path,
    mode: request.mode,
    originalPath: request.originalPath,
  };
  if (existing) {
    tabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === existing.id ? { ...tab, title, data } : tab,
      ),
      activeId: existing.id,
    });
    return existing.id;
  }
  const [id] = tabs.allocate(1);
  tabs.transition({
    tabs: [...snapshot.tabs, { id, kind: "git-diff", rigId, title, data }],
    activeId: id,
  });
  return id;
}

/** Route terminal block diff intents into the selected shared tabs provider. */
export function installTerminalDiffNavigation(
  events: ApplicationEventsCapability,
  tabs: WorkspaceTabsCapability,
): () => void {
  return events.subscribe(TERMINAL_BLOCK_EVENTS.openDiff, (payload) => {
    const { path, repoRoot } = payload as Partial<TerminalBlockOpenDiff>;
    if (typeof path !== "string" || !path) return;
    if (typeof repoRoot !== "string" || !repoRoot) return;
    openWorkingDiffTab(tabs, {
      path,
      repoRoot,
      mode: "-",
      originalPath: null,
    });
  });
}

export function openHistoryTab(
  tabs: WorkspaceTabsCapability,
  request: SourceControlGraphRequest,
): void {
  const snapshot = tabs.snapshot();
  const existing = snapshot.tabs.find(
    (tab) =>
      tab.kind === "git-history" && tab.data?.repoRoot === request.repoRoot,
  );
  const title = request.branch ? `History · ${request.branch}` : "Git History";
  if (existing) {
    tabs.transition({
      tabs: snapshot.tabs.map((tab) =>
        tab.id === existing.id ? { ...tab, title } : tab,
      ),
      activeId: existing.id,
    });
    return;
  }
  const [id] = tabs.allocate(1);
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
  tabs.transition({
    tabs: [
      ...snapshot.tabs,
      {
        id,
        kind: "git-history",
        rigId: active?.rigId ?? snapshot.activeRigIdForNewTabs,
        title,
        data: { repoRoot: request.repoRoot },
      },
    ],
    activeId: id,
  });
}

export function createSourceControlNavigation(
  git: GitCapability,
  tabs: WorkspaceTabsCapability,
  currentContext: () => {
    rootPath: string | null;
    workspace: WorkspaceEnv;
  },
): SourceControlNavigationCapability {
  return {
    async openGraph(request) {
      if (request) {
        openHistoryTab(tabs, request);
        return;
      }
      const snapshot = tabs.snapshot();
      const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeId);
      const { rootPath, workspace } = currentContext();
      const path = sourceControlContextPath(active, rootPath);
      if (!path) return;
      const repo = await git.resolveRepo(path, workspace).catch(() => null);
      if (!repo) return;
      openHistoryTab(tabs, {
        repoRoot: repo.repoRoot,
        branch: repo.branch,
      });
    },
  };
}
