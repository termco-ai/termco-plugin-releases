import type { GitRepoInfo, GitStatusSnapshot } from "@termco/git-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export type SourceControlRefreshMode = "auto" | "always" | "never";
export type SourceControlRemoteAction = "fetch" | "pull" | "push";
export type SourceControlRemoteActionMode =
  | "contextual"
  | SourceControlRemoteAction;

export type SourceControlRemoteActionResult = {
  ok: boolean;
  action: SourceControlRemoteAction | null;
  error?: string;
  blocked?: "diverged" | "missing-upstream" | "no-repo";
};

export type SourceControlSummary = {
  workspace?: WorkspaceEnv;
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  changedCount: number;
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRepo: boolean;
  isLoading: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
  applyStatus: (
    updater: (status: GitStatusSnapshot) => GitStatusSnapshot,
  ) => void;
  refresh: (options?: { remote?: SourceControlRefreshMode }) => Promise<void>;
  runRemoteAction: (
    mode?: SourceControlRemoteActionMode,
  ) => Promise<SourceControlRemoteActionResult>;
};

export type SourceControlRemoteIndicator = {
  visible: boolean;
  label: string;
  title: string;
  disabled: boolean;
  action: SourceControlRemoteAction | null;
};

export type SourceControlSummaryState = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  hasRepo: boolean;
  isLoading: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
};
