/**
 * Pathspec resolution (resolveWithinRepo). Rejects traversal/absolute escapes
 * out of the repo root.
 */
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { GitError } from "./errors";

function isSafePathspec(rel: string): boolean {
  return rel.length > 0 && !rel.includes("\0") && !rel.startsWith("-");
}

function within(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

/** Resolve `rel` to an absolute path guaranteed to be inside `repoRoot`. */
export function resolveWithinRepo(repoRoot: string, rel: string): string {
  if (!isSafePathspec(rel)) {
    throw new GitError("commandFailed", `invalid path: ${rel}`);
  }
  let root = repoRoot;
  try {
    root = realpathSync(repoRoot);
  } catch {
    // use as-is
  }
  const joined = isAbsolute(rel) ? resolve(rel) : resolve(root, rel);
  let canonical = joined;
  try {
    canonical = realpathSync(joined);
  } catch {
    // file may not exist (deleted) — validate the normalized path instead
  }
  if (!within(root, canonical)) {
    throw new GitError("pathOutsideWorkspace", canonical);
  }
  return canonical;
}

/** Repo-relative, forward-slashed pathspec for `absolute`. */
export function pathspec(repoRoot: string, absolute: string): string {
  let root = repoRoot;
  try {
    root = realpathSync(repoRoot);
  } catch {
    // as-is
  }
  const rel = relative(root, absolute);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
    return rel.replace(/\\/g, "/");
  }
  return absolute.replace(/\\/g, "/");
}

export function pathspecFromInput(repoRoot: string, rel: string): string {
  return pathspec(repoRoot, resolveWithinRepo(repoRoot, rel));
}

export function resolvePathspecs(repoRoot: string, paths: string[]): string[] {
  return paths.map((p) => pathspecFromInput(repoRoot, p));
}
