/**
 * Diff sources and load-state modelling for the git diff pane.
 *
 * Describes what to diff (a working-tree change or a committed file) and the
 * async load lifecycle, plus cache-key derivation and a synchronous read of any
 * already-cached diff so the pane can paint instantly on tab switch.
 */
import type { DiffSideState } from "../../../runtime";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { commitDiffKey, getCachedDiff, workingDiffKey } from "./diffCache";

export type WorkingSource = {
  kind: "working";
  repoRoot: string;
  path: string;
  mode: "-" | "+";
  originalPath: string | null;
  workspace?: WorkspaceEnv;
};

export type CommitSource = {
  kind: "commit";
  repoRoot: string;
  sha: string;
  path: string;
  originalPath: string | null;
  workspace?: WorkspaceEnv;
};

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "loaded";
      originalContent: string;
      modifiedContent: string;
      /** Why each side is what it is — see `DiffSideState`. */
      originalState: DiffSideState;
      modifiedState: DiffSideState;
      isBinary: boolean;
      fallbackPatch: string;
    }
  | { kind: "error"; message: string };

/** Stable cache key for a diff source, keyed by repo, path, and mode/sha. */
export function cacheKey(source: WorkingSource | CommitSource): string {
  return source.kind === "working"
    ? workingDiffKey(
        source.repoRoot,
        source.path,
        source.mode,
        source.workspace,
      )
    : commitDiffKey(
        source.repoRoot,
        source.sha,
        source.path,
        source.workspace,
      );
}

/** Read a source's diff from cache, returning `idle` on a miss. */
export function loadStateFromCache(
  source: WorkingSource | CommitSource,
): LoadState {
  const hit = getCachedDiff(cacheKey(source));
  if (!hit) return { kind: "idle" };
  return {
    kind: "loaded",
    originalContent: hit.originalContent,
    modifiedContent: hit.modifiedContent,
    originalState: hit.originalState ?? "ok",
    modifiedState: hit.modifiedState ?? "ok",
    isBinary: hit.isBinary,
    fallbackPatch: hit.fallbackPatch,
  };
}
