import { type GitDiffContentResult, native } from "../../../runtime";
import { currentWorkspaceScopeKey } from "../../../runtime";
import type { WorkspaceEnv } from "@termco/workspace-base";

const DIFF_CACHE_LIMIT = 6;
const inflight = new Map<string, Promise<GitDiffContentResult>>();
const cache = new Map<string, GitDiffContentResult>();

function touch(key: string, value: GitDiffContentResult) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > DIFF_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function getCachedDiff(key: string): GitDiffContentResult | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

export function invalidateDiff(key: string): void {
  cache.delete(key);
}

export function invalidateRepoDiffs(
  repoRoot: string,
  workspace?: WorkspaceEnv,
): void {
  const prefix = workspace
    ? `${currentWorkspaceScopeKey(workspace)}|${repoRoot}|`
    : null;
  for (const k of [...cache.keys()]) {
    if (prefix ? k.startsWith(prefix) : k.includes(`|${repoRoot}|`)) {
      cache.delete(k);
    }
  }
}

/** Cross-plugin invalidation keys omit the workspace prefix on purpose. */
export function invalidateExternalDiffKey(key: string): void {
  const [repoRoot, path, mode] = key.split("\0");
  if (!repoRoot || !path || (mode !== "+" && mode !== "-")) return;
  const suffix = `|${repoRoot}|w|${mode}|${path}`;
  for (const cachedKey of [...cache.keys()]) {
    if (cachedKey.endsWith(suffix)) {
      cache.delete(cachedKey);
    }
  }
}

export function workingDiffKey(
  repoRoot: string,
  path: string,
  mode: "-" | "+",
  workspace?: WorkspaceEnv,
): string {
  return `${currentWorkspaceScopeKey(workspace)}|${repoRoot}|w|${mode}|${path}`;
}

export function commitDiffKey(
  repoRoot: string,
  sha: string,
  path: string,
  workspace?: WorkspaceEnv,
): string {
  return `${currentWorkspaceScopeKey(workspace)}|${repoRoot}|c|${sha}|${path}`;
}

export async function fetchWorkingDiff(
  repoRoot: string,
  path: string,
  mode: "-" | "+",
  originalPath: string | null,
  workspace?: WorkspaceEnv,
): Promise<GitDiffContentResult> {
  const key = workingDiffKey(repoRoot, path, mode, workspace);
  const cached = getCachedDiff(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request =
    workspace === undefined
      ? native.gitDiffContent(repoRoot, path, mode === "+", originalPath)
      : native.gitDiffContent(
          repoRoot,
          path,
          mode === "+",
          originalPath,
          workspace,
        );
  const p = request
    .then((res) => {
      touch(key, res);
      return res;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export async function fetchCommitDiff(
  repoRoot: string,
  sha: string,
  path: string,
  originalPath: string | null,
  workspace?: WorkspaceEnv,
): Promise<GitDiffContentResult> {
  const key = commitDiffKey(repoRoot, sha, path, workspace);
  const cached = getCachedDiff(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request =
    workspace === undefined
      ? native.gitCommitFileDiff(repoRoot, sha, path, originalPath)
      : native.gitCommitFileDiff(
          repoRoot,
          sha,
          path,
          originalPath,
          workspace,
        );
  const p = request
    .then((res) => {
      touch(key, res);
      return res;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
