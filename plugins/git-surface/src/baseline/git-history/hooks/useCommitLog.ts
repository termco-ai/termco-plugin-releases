/**
 * Paginated commit-log loading, filtering, and virtualisation.
 *
 * Owns the commit list and its load lifecycle: the initial page, cursor-based
 * "load more" paging, request-id guarding against stale responses, and the
 * derived filtered list plus its TanStack virtualizer. (The auto-fill loop that
 * keeps paging until the viewport is covered lives in the container, where it
 * can read the scroll element's dimensions.)
 */
import { type GitLogEntry, native } from "../../../runtime";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { PAGE_SIZE, ROW_HEIGHT } from "../lib/constants";
import { normalizeError } from "../lib/format";
import type { LoadStatus } from "../types";

/** Commit-log state, actions, and the derived filtered virtualizer. */
export type CommitLogController = {
  commits: GitLogEntry[];
  setCommits: Dispatch<SetStateAction<GitLogEntry[]>>;
  loadStatus: LoadStatus;
  error: string | null;
  endReached: boolean;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  filtered: GitLogEntry[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
};

/**
 * Load and virtualise the commit log for `repoRoot`, filtered by `activeSearch`.
 *
 * @param repoRoot Absolute repository root passed to the native git log.
 * @param activeSearch Debounced query; when non-empty, paging is suspended.
 * @param scrollRef The scroll container whose fill drives auto-paging.
 */
export function useCommitLog(
  repoRoot: string,
  activeSearch: string,
  scrollRef: RefObject<HTMLDivElement | null>,
  workspace?: WorkspaceEnv,
): CommitLogController {
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [endReached, setEndReached] = useState(false);

  const requestIdRef = useRef(0);
  const inflightMoreRef = useRef(false);

  const filtered = useMemo(() => {
    const q = activeSearch.toLowerCase();
    if (!q) return commits;
    return commits.filter((c) => {
      const subject = c.subject.toLowerCase();
      const author = c.author.toLowerCase();
      const email = c.authorEmail.toLowerCase();
      return (
        subject.includes(q) ||
        author.includes(q) ||
        email.includes(q) ||
        c.shortSha.includes(q)
      );
    });
  }, [commits, activeSearch]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => filtered[index]?.sha ?? index,
  });

  const loadInitial = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoadStatus("initial");
    setError(null);
    setEndReached(false);
    try {
      const entries = await (workspace === undefined
        ? native.gitLog(repoRoot, { limit: PAGE_SIZE })
        : native.gitLog(repoRoot, { limit: PAGE_SIZE }, workspace));
      if (requestId !== requestIdRef.current) return;
      setCommits(entries);
      setLoadStatus("idle");
      if (entries.length < PAGE_SIZE) setEndReached(true);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(normalizeError(err));
      setLoadStatus("error");
    }
  }, [repoRoot, workspace]);

  const loadMore = useCallback(async () => {
    if (inflightMoreRef.current || endReached) return;
    if (loadStatus !== "idle") return;
    const last = commits[commits.length - 1];
    if (!last) return;
    inflightMoreRef.current = true;
    setLoadStatus("more");
    try {
      const options = { limit: PAGE_SIZE, beforeSha: last.sha };
      const entries = await (workspace === undefined
        ? native.gitLog(repoRoot, options)
        : native.gitLog(repoRoot, options, workspace));
      setCommits((prev) => {
        const seen = new Set(prev.map((c) => c.sha));
        const merged = [...prev];
        for (const e of entries) if (!seen.has(e.sha)) merged.push(e);
        return merged;
      });
      if (entries.length < PAGE_SIZE) setEndReached(true);
      setLoadStatus("idle");
    } catch (err) {
      setError(normalizeError(err));
      setLoadStatus("error");
    } finally {
      inflightMoreRef.current = false;
    }
  }, [commits, endReached, loadStatus, repoRoot, workspace]);

  return {
    commits,
    setCommits,
    loadStatus,
    error,
    endReached,
    loadInitial,
    loadMore,
    filtered,
    virtualizer,
  };
}
