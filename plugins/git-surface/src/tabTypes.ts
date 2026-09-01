import type { WorkspaceEnv } from "@termco/workspace-base";

type TabBase = {
  id: number;
  rigId: string;
  title: string;
  cold?: boolean;
  workspace?: WorkspaceEnv;
};

export type GitDiffTab = TabBase & {
  kind: "git-diff";
  path: string;
  repoRoot: string;
  mode: "-" | "+";
  originalPath: string | null;
};

export type GitHistoryTab = TabBase & {
  kind: "git-history";
  repoRoot: string;
};

export type GitCommitFileDiffTab = TabBase & {
  kind: "git-commit-file";
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

export type OtherTab = TabBase & { kind: string };
export type Tab =
  | GitDiffTab
  | GitHistoryTab
  | GitCommitFileDiffTab
  | OtherTab;
