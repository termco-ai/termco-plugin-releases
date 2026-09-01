/**
 * Repository discovery (resolve_repo). Registry authorization gating is
 * deferred to M5; here we
 * canonicalize locally and query git directly.
 */
import type { WorkspaceEnv } from "@termco/workspace-base";
import { GitError } from "./errors";
import {
  canonicalDir,
  ensureGitAvailable,
  gitStdoutLineOpt,
  gitStdoutLines,
} from "./runner";
import { authorize } from "./runtime";

export interface GitRepoInfo {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
}

export async function resolveRepo(
  cwd: string,
  workspace: WorkspaceEnv,
): Promise<GitRepoInfo | null> {
  const dir = canonicalDir(cwd);
  await ensureGitAvailable(workspace);

  const rootLine = await gitStdoutLineOpt(workspace, dir, [
    "rev-parse",
    "--show-toplevel",
  ]);
  if (!rootLine) return null;

  // Authorize the discovered repo root into the registry (mirrors resolve_repo).
  let root: string;
  try {
    root = authorize(rootLine, workspace);
  } catch {
    root = canonicalDir(rootLine);
  }

  const head =
    (await gitStdoutLines(workspace, root, ["rev-parse", "--abbrev-ref", "HEAD"]))[0] ??
    (await gitStdoutLineOpt(workspace, root, ["symbolic-ref", "--short", "HEAD"]));
  if (!head) {
    throw new GitError("commandFailed", "failed to resolve HEAD");
  }

  const upstream = await gitStdoutLineOpt(workspace, root, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);

  return {
    repoRoot: root,
    branch: head,
    upstream,
    isDetached: head === "HEAD",
  };
}
