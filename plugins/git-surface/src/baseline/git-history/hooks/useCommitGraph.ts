/**
 * Commit-graph layout hook.
 *
 * Wraps the incremental lane-assignment layout (`layoutGraph`) in a cache so
 * appended pages of commits extend the existing graph instead of relayouting
 * from scratch. Recomputes fully only when the head commit changes (a refresh
 * or repo switch), and appends when new commits are added to the tail.
 */
import type { GitLogEntry } from "../../../runtime";
import { useMemo, useRef } from "react";
import {
  EMPTY_GRAPH_STATE,
  type GraphRow,
  type GraphState,
  layoutGraph,
} from "../lib/graph";

/** Rendered graph data keyed by commit SHA, plus the max concurrent lanes. */
export type CommitGraph = {
  graphByCommit: Map<string, GraphRow>;
  maxLaneCount: number;
};

/**
 * Compute (and incrementally cache) the commit-graph rows for `commits`.
 * Returns a SHA→row map and the peak lane count used to size the rail column.
 */
export function useCommitGraph(commits: GitLogEntry[]): CommitGraph {
  const graphCacheRef = useRef<{
    rows: GraphRow[];
    byCommit: Map<string, GraphRow>;
    tail: GraphState;
    firstSha: string | null;
    len: number;
    maxLaneCount: number;
  }>({
    rows: [],
    byCommit: new Map(),
    tail: EMPTY_GRAPH_STATE,
    firstSha: null,
    len: 0,
    maxLaneCount: 1,
  });

  return useMemo(() => {
    const cache = graphCacheRef.current;
    if (commits.length === 0) {
      cache.rows = [];
      cache.byCommit = new Map();
      cache.tail = EMPTY_GRAPH_STATE;
      cache.firstSha = null;
      cache.len = 0;
      cache.maxLaneCount = 1;
      return { graphByCommit: cache.byCommit, maxLaneCount: 1 };
    }
    const firstSha = commits[0].sha;
    const canAppend =
      cache.firstSha === firstSha && commits.length >= cache.len;
    if (!canAppend) {
      const { rows, state } = layoutGraph(commits);
      const byCommit = new Map<string, GraphRow>();
      let max = 1;
      for (const row of rows) {
        byCommit.set(row.sha, row);
        if (row.laneCount > max) max = row.laneCount;
      }
      cache.rows = rows;
      cache.byCommit = byCommit;
      cache.tail = state;
      cache.firstSha = firstSha;
      cache.len = commits.length;
      cache.maxLaneCount = max;
      return { graphByCommit: byCommit, maxLaneCount: max };
    }
    if (commits.length > cache.len) {
      const delta = commits.slice(cache.len);
      const { rows: newRows, state } = layoutGraph(delta, cache.tail);
      let max = cache.maxLaneCount;
      for (const row of newRows) {
        cache.byCommit.set(row.sha, row);
        if (row.laneCount > max) max = row.laneCount;
      }
      cache.rows = cache.rows.concat(newRows);
      cache.tail = state;
      cache.len = commits.length;
      cache.maxLaneCount = max;
    }
    return { graphByCommit: cache.byCommit, maxLaneCount: cache.maxLaneCount };
  }, [commits]);
}
