/**
 * Per-commit changed-files cache for the git-history detail popover.
 *
 * Lazily fetches a commit's file list on demand, dedupes in-flight requests,
 * and keeps at most `FILES_CACHE_LIMIT` entries (LRU by insertion order). A
 * monotonic internal tick lets the currently-open commit's entry be re-read
 * from the mutable cache reactively.
 */
import { native } from "../../../runtime";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useCallback, useMemo, useRef, useState } from "react";
import { FILES_CACHE_LIMIT } from "../lib/constants";
import { normalizeError } from "../lib/format";
import type { FilesEntry } from "../types";

/** Imperative API over the commit-files cache. */
export type CommitFilesController = {
  /** Cache entry for the currently-open commit (`null` when none is open). */
  openFilesEntry: FilesEntry | null;
  /** Fetch (or refetch on prior error) the file list for `sha`. */
  fetchFiles: (sha: string) => Promise<void>;
  /** Clear the cache and any in-flight tracking (repo switch / refresh). */
  resetFiles: () => void;
};

/**
 * Create the changed-files controller bound to `repoRoot`.
 *
 * @param openSha SHA of the commit whose detail popover is open, or `null`.
 *   Determines which cache entry is surfaced as `openFilesEntry`.
 */
export function useCommitFiles(
  repoRoot: string,
  openSha: string | null,
  workspace?: WorkspaceEnv,
): CommitFilesController {
  const filesCacheRef = useRef(new Map<string, FilesEntry>());
  const [filesTick, setFilesTick] = useState(0);
  const bumpFiles = useCallback(() => setFilesTick((n) => n + 1), []);
  const filesInflightRef = useRef(new Set<string>());

  const fetchFiles = useCallback(
    async (sha: string) => {
      if (filesInflightRef.current.has(sha)) return;
      const cache = filesCacheRef.current;
      const existing = cache.get(sha);
      if (existing && existing.state !== "error") return;
      filesInflightRef.current.add(sha);
      cache.set(sha, { state: "loading" });
      bumpFiles();
      try {
        const files = await (workspace === undefined
          ? native.gitCommitFiles(repoRoot, sha)
          : native.gitCommitFiles(repoRoot, sha, workspace));
        cache.set(sha, { state: "loaded", files });
        while (cache.size > FILES_CACHE_LIMIT) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined || oldest === sha) break;
          cache.delete(oldest);
        }
        bumpFiles();
      } catch (err) {
        cache.set(sha, { state: "error", error: normalizeError(err) });
        bumpFiles();
      } finally {
        filesInflightRef.current.delete(sha);
      }
    },
    [repoRoot, workspace],
  );

  const resetFiles = useCallback(() => {
    filesInflightRef.current.clear();
    filesCacheRef.current.clear();
    bumpFiles();
  }, [bumpFiles]);

  const openFilesEntry = useMemo(() => {
    if (!openSha) return null;
    return filesCacheRef.current.get(openSha) ?? null;
  }, [openSha, filesTick]);

  return { openFilesEntry, fetchFiles, resetFiles };
}
