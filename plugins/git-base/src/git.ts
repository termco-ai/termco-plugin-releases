import type { WorkspaceEnv } from "@termco/workspace-base";

export interface GitChangedFile {
  path: string;
  originalPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  indexStatus: string;
  worktreeStatus: string;
  statusLabel: string;
}

export interface GitRepoInfo {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
}

export interface GitStatusSnapshot {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  truncated: boolean;
  changedFiles: GitChangedFile[];
}

export interface GitPanelSnapshot {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
}

export interface GitDiscardEntry {
  path: string;
  untracked: boolean;
}

export interface GitCommitResult {
  commitSha: string;
  summary: string;
}

export interface GitCommitFileChange {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
}

export interface GitDiffResult {
  diffText: string;
  truncated: boolean;
}

export type GitDiffSideState = "ok" | "missing" | "binary";

export interface GitDiffContentResult {
  originalContent: string;
  modifiedContent: string;
  originalState: GitDiffSideState;
  modifiedState: GitDiffSideState;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
}

export interface GitLogEntry {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitPushResult {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
}

export interface GitBranchEntry {
  name: string;
  kind: string;
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
  upstream?: string | null;
}

export interface GitBranchListResult {
  branches: GitBranchEntry[];
}

/** Complete, replaceable application-wide Git provider contract. */
export interface GitCapability {
  resolveRepo(cwd: string, workspace: WorkspaceEnv): Promise<GitRepoInfo | null>;
  panelSnapshot(cwd: string, workspace: WorkspaceEnv): Promise<GitPanelSnapshot>;
  status(repoRoot: string, workspace: WorkspaceEnv): Promise<GitStatusSnapshot>;
  diff(repoRoot: string, path: string | undefined, staged: boolean, workspace: WorkspaceEnv): Promise<GitDiffResult>;
  diffContent(repoRoot: string, path: string, staged: boolean, originalPath: string | undefined, workspace: WorkspaceEnv): Promise<GitDiffContentResult>;
  stage(repoRoot: string, paths: string[], workspace: WorkspaceEnv): Promise<void>;
  unstage(repoRoot: string, paths: string[], workspace: WorkspaceEnv): Promise<void>;
  discard(repoRoot: string, entries: GitDiscardEntry[], workspace: WorkspaceEnv): Promise<void>;
  commit(repoRoot: string, message: string, workspace: WorkspaceEnv): Promise<GitCommitResult>;
  commitFiles(repoRoot: string, sha: string, workspace: WorkspaceEnv): Promise<GitCommitFileChange[]>;
  commitFileDiff(repoRoot: string, sha: string, path: string, originalPath: string | undefined, workspace: WorkspaceEnv): Promise<GitDiffContentResult>;
  fetch(repoRoot: string, workspace: WorkspaceEnv): Promise<void>;
  pullFfOnly(repoRoot: string, workspace: WorkspaceEnv): Promise<void>;
  push(repoRoot: string, workspace: WorkspaceEnv): Promise<GitPushResult>;
  log(repoRoot: string, limit: number, beforeSha: string | undefined, workspace: WorkspaceEnv): Promise<GitLogEntry[]>;
  showCommit(repoRoot: string, sha: string, workspace: WorkspaceEnv): Promise<GitDiffResult>;
  listBranches(repoRoot: string, workspace: WorkspaceEnv): Promise<GitBranchListResult>;
  checkoutBranch(repoRoot: string, branch: string, workspace: WorkspaceEnv): Promise<void>;
  remoteUrl(repoRoot: string, name: string, workspace: WorkspaceEnv): Promise<string | null>;
}
