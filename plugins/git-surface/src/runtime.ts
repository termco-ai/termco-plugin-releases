import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type {
  GitCapability,
  GitCommitFileChange,
  GitDiffContentResult as SdkGitDiffContentResult,
  GitDiffSideState,
  GitLogEntry,
} from "@termco/git-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export type GitSurfaceRuntime = {
  git: GitCapability;
  desktop: DesktopIntegrationCapability;
  fileIcons: WorkspaceFileIconsCapability;
  theme: UiThemeCapability;
};

let selected: GitSurfaceRuntime | null = null;

export function installGitSurfaceRuntime(runtime: GitSurfaceRuntime): () => void {
  selected = runtime;
  return () => {
    if (selected === runtime) selected = null;
  };
}

export function gitSurfaceRuntime(): GitSurfaceRuntime {
  if (!selected) throw new Error("Git surface plugin is not active");
  return selected;
}

export type DiffSideState = GitDiffSideState;
export type GitDiffContentResult = Omit<
  SdkGitDiffContentResult,
  "originalState" | "modifiedState"
> & {
  /** Older cached/test fixtures predate explicit side-state metadata. */
  originalState?: GitDiffSideState;
  modifiedState?: GitDiffSideState;
};
export type { GitCommitFileChange, GitLogEntry };

export const DEFAULT_WORKSPACE: WorkspaceEnv = Object.freeze({
  kind: "local",
});

export function workspaceScopeKey(
  workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
): string {
  if (!workspace || workspace.kind === "local") return "local";
  if (workspace.kind === "wsl") return `wsl:${workspace.distro}`;
  return `ssh:${workspace.connectionId}`;
}

/** Baseline-compatible adapter over the selected shared Git provider. */
export const native = {
  gitLog(
    repoRoot: string,
    options: { limit: number; beforeSha?: string },
    workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
  ): Promise<GitLogEntry[]> {
    return gitSurfaceRuntime().git.log(
      repoRoot,
      options.limit,
      options.beforeSha,
      workspace,
    );
  },
  gitCommitFiles(
    repoRoot: string,
    sha: string,
    workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
  ): Promise<GitCommitFileChange[]> {
    return gitSurfaceRuntime().git.commitFiles(repoRoot, sha, workspace);
  },
  gitRemoteUrl(
    repoRoot: string,
    workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
  ): Promise<string | null> {
    return gitSurfaceRuntime().git.remoteUrl(repoRoot, "origin", workspace);
  },
  gitDiffContent(
    repoRoot: string,
    path: string,
    staged: boolean,
    originalPath: string | null,
    workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
  ): Promise<GitDiffContentResult> {
    return gitSurfaceRuntime().git.diffContent(
      repoRoot,
      path,
      staged,
      originalPath ?? undefined,
      workspace,
    );
  },
  gitCommitFileDiff(
    repoRoot: string,
    sha: string,
    path: string,
    originalPath: string | null,
    workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
  ): Promise<GitDiffContentResult> {
    return gitSurfaceRuntime().git.commitFileDiff(
      repoRoot,
      sha,
      path,
      originalPath ?? undefined,
      workspace,
    );
  },
};

export function currentWorkspaceScopeKey(
  workspace: WorkspaceEnv = DEFAULT_WORKSPACE,
): string {
  return workspaceScopeKey(workspace);
}

export function fileIconUrl(name: string): string {
  return gitSurfaceRuntime().fileIcons.fileIconUrl(name);
}

export function openUrl(url: string): Promise<void> {
  return Promise.resolve(gitSurfaceRuntime().desktop.openUrl(url));
}

export function writeClipboardText(value: string): Promise<void> {
  return Promise.resolve(gitSurfaceRuntime().desktop.writeClipboardText(value));
}
