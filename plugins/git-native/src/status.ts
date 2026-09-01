/**
 * Working-tree status.
 */
import type { WorkspaceEnv } from "@termco/workspace-base";
import { ensureSuccess } from "./errors";
import { parsePorcelainV2, type GitChangedFile } from "./parser";
import { canonicalDir, ensureGitAvailable, runGit, DEFAULT_TIMEOUT_SECS } from "./runner";

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

export async function gitStatus(
  repoRoot: string,
  workspace: WorkspaceEnv,
): Promise<GitStatusSnapshot> {
  const root = canonicalDir(repoRoot);
  await ensureGitAvailable(workspace);
  const output = await runGit(
    workspace,
    root,
    ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"],
    DEFAULT_TIMEOUT_SECS,
  );
  ensureSuccess(output, "git status failed");
  const parsed = parsePorcelainV2(output.stdout.toString("utf8"));
  return {
    repoRoot: root,
    branch: parsed.branch,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    isDetached: parsed.isDetached,
    truncated: output.truncated,
    changedFiles: parsed.files,
  };
}
