import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { AiModelRegistry } from "@termco/ai-models-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import type { WorkspaceEnv, WorkspaceTabsCapability } from "@termco/workspace-base";

export type SourceControlRuntime = {
  git: GitCapability;
  desktop: DesktopIntegrationCapability;
  fileIcons: WorkspaceFileIconsCapability;
  tabs: WorkspaceTabsCapability;
  inference: AiInferenceCapability | null;
  sessions: AiSessionsCapability | null;
  models: AiModelRegistry;
  configuredProviderIds: readonly string[];
};

let runtime: SourceControlRuntime | null = null;
let workspace: WorkspaceEnv = null;
let rootPath: string | null = null;

export function installSourceControlRuntime(next: SourceControlRuntime): () => void {
  runtime = next;
  return () => {
    if (runtime === next) runtime = null;
  };
}

export function setSourceControlWorkspace(next: WorkspaceEnv): void {
  workspace = next;
}

export function setSourceControlContext(
  nextRootPath: string | null,
  nextWorkspace: WorkspaceEnv,
): void {
  rootPath = nextRootPath;
  workspace = nextWorkspace;
}

export function sourceControlContext(): {
  rootPath: string | null;
  workspace: WorkspaceEnv;
} {
  return { rootPath, workspace };
}

export function sourceControlRuntime(): SourceControlRuntime {
  if (!runtime) throw new Error("Source Control plugin is not active");
  return runtime;
}

export function sourceControlWorkspace(): WorkspaceEnv {
  return workspace;
}

/** Baseline-compatible Git interface backed by the selected shared provider.
 * This is an internal adapter: it contains no Git implementation or state. */
export const native = {
  gitResolveRepo: (cwd: string) =>
    sourceControlRuntime().git.resolveRepo(cwd, sourceControlWorkspace()),
  gitPanelSnapshot: (cwd: string) =>
    sourceControlRuntime().git.panelSnapshot(cwd, sourceControlWorkspace()),
  gitStatus: (repoRoot: string) =>
    sourceControlRuntime().git.status(repoRoot, sourceControlWorkspace()),
  gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
    sourceControlRuntime().git.diff(
      repoRoot,
      path ?? undefined,
      staged,
      sourceControlWorkspace(),
    ),
  gitStage: (repoRoot: string, paths: string[]) =>
    sourceControlRuntime().git.stage(repoRoot, paths, sourceControlWorkspace()),
  gitUnstage: (repoRoot: string, paths: string[]) =>
    sourceControlRuntime().git.unstage(repoRoot, paths, sourceControlWorkspace()),
  gitDiscard: (
    repoRoot: string,
    entries: Array<{ path: string; untracked: boolean }>,
  ) =>
    sourceControlRuntime().git.discard(
      repoRoot,
      entries,
      sourceControlWorkspace(),
    ),
  gitCommit: (repoRoot: string, message: string) =>
    sourceControlRuntime().git.commit(
      repoRoot,
      message,
      sourceControlWorkspace(),
    ),
  gitFetch: (repoRoot: string) =>
    sourceControlRuntime().git.fetch(repoRoot, sourceControlWorkspace()),
  gitPullFfOnly: (repoRoot: string) =>
    sourceControlRuntime().git.pullFfOnly(repoRoot, sourceControlWorkspace()),
  gitPush: (repoRoot: string) =>
    sourceControlRuntime().git.push(repoRoot, sourceControlWorkspace()),
  gitListBranches: (repoRoot: string) =>
    sourceControlRuntime().git.listBranches(repoRoot, sourceControlWorkspace()),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    sourceControlRuntime().git.checkoutBranch(
      repoRoot,
      branch,
      sourceControlWorkspace(),
    ),
};

export function fileIconUrl(name: string): string {
  return sourceControlRuntime().fileIcons.fileIconUrl(name);
}

export async function copyToClipboard(text: string): Promise<void> {
  try {
    sourceControlRuntime().desktop.writeClipboardText(text);
  } catch {
    // Baseline behavior is best-effort when clipboard access is unavailable.
  }
}

export async function revealItem(path: string): Promise<void> {
  try {
    sourceControlRuntime().desktop.revealItem(path);
  } catch (error) {
    console.error("revealItem failed:", error);
  }
}
