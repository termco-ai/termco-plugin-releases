import type { GitRepoInfo, GitStatusSnapshot } from "@termco/git-base";

export type PanelState = "closed" | "loading" | "no-repo" | "ready" | "error";
export type DiffMode = "+" | "-";
export type SelectionTransition = "none" | "moved-group" | "reset";

export type DiffSelection = {
  path: string;
  mode: DiffMode;
};

export type SourceControlEntry = {
  key: string;
  path: string;
  mode: DiffMode;
  indexStatus: string;
  worktreeStatus: string;
  statusLabel: string;
  statusCode: string;
  originalPath: string | null;
  untracked: boolean;
};

export type CheckState = "checked" | "indeterminate" | "unchecked";

/** One row per changed file (flat list) — merges the staged/unstaged split. */
export type SourceControlFileEntry = {
  key: string;
  path: string;
  originalPath: string | null;
  statusCode: string;
  statusLabel: string;
  checkState: CheckState;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
};

export type PendingDiscard = {
  scope: "single" | "all";
  count: number;
  label: string;
};

export type SourceControlPanelState = {
  panelState: PanelState;
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  selected: DiffSelection | null;
  commitMessage: string;
  actionBusy: string | null;
  statusError: string | null;
  actionError: string | null;
  remoteError: string | null;
  actionMessage: string | null;
  stagedEntries: SourceControlEntry[];
  unstagedEntries: SourceControlEntry[];
  fileEntries: SourceControlFileEntry[];
  headerCheckState: CheckState;
  allClean: boolean;
  canPush: boolean;
  pushHint: string | null;
  canGenerateCommitMessage: boolean;
  generateCommitMessageHint: string;
  selectionTransition: SelectionTransition;
  stagedEmptyText: string;
  unstagedEmptyText: string;
  pendingDiscard: PendingDiscard | null;
  setCommitMessage: (value: string) => void;
  refresh: () => Promise<void>;
  selectEntry: (entry: SourceControlEntry) => Promise<void>;
  selectFile: (entry: SourceControlFileEntry) => Promise<void>;
  stageEntry: (entry: SourceControlEntry) => Promise<void>;
  unstageEntry: (entry: SourceControlEntry) => Promise<void>;
  toggleStageFile: (entry: SourceControlFileEntry) => Promise<void>;
  toggleAll: () => Promise<void>;
  requestDiscardEntry: (entry: SourceControlEntry) => void;
  requestDiscardFile: (entry: SourceControlFileEntry) => void;
  requestDiscardAll: () => void;
  confirmPendingDiscard: () => Promise<void>;
  cancelPendingDiscard: () => void;
  stageAllEntries: () => Promise<void>;
  unstageAllEntries: () => Promise<void>;
  generateCommitMessage: () => Promise<void>;
  commit: () => Promise<void>;
  push: () => Promise<void>;
};
