import type { GitLogEntry } from "../../../runtime";
import { describe, expect, it } from "vitest";
import {
  EMPTY_GRAPH_STATE,
  LANE_COLORS,
  laneColor,
  layoutGraph,
} from "./graph";

function commit(sha: string, parents: string[]): GitLogEntry {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: "Dev",
    authorEmail: "dev@example.com",
    timestampSecs: 1700000000,
    parents,
    subject: `commit ${sha}`,
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
  };
}

describe("laneColor", () => {
  it("cycles through the palette", () => {
    expect(laneColor(0)).toBe(LANE_COLORS[0]);
    expect(laneColor(3)).toBe(LANE_COLORS[3]);
    expect(laneColor(LANE_COLORS.length)).toBe(LANE_COLORS[0]);
    expect(laneColor(LANE_COLORS.length + 2)).toBe(LANE_COLORS[2]);
  });
});

describe("layoutGraph linear history", () => {
  const commits = [commit("a", ["b"]), commit("b", ["c"]), commit("c", [])];

  it("keeps a single lane throughout", () => {
    const { rows, state } = layoutGraph(commits);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows.every((r) => r.laneCount === 1)).toBe(true);
    expect(state.lanes).toEqual([]);
  });

  it("draws a fresh tip without a top edge, then verticals", () => {
    const { rows } = layoutGraph(commits);
    expect(rows[0].topEdges).toEqual([]);
    expect(rows[0].bottomEdges).toEqual([
      { kind: "straight", lane: 0, color: laneColor(0) },
    ]);
    expect(rows[1].topEdges).toEqual([
      { kind: "straight", lane: 0, color: laneColor(0) },
    ]);
    // Root commit has no parents: nothing continues below it.
    expect(rows[2].bottomEdges).toEqual([]);
  });
});

describe("layoutGraph merges and branches", () => {
  // a is a merge of b and c; both eventually converge on root d.
  const commits = [
    commit("a", ["b", "c"]),
    commit("b", ["d"]),
    commit("c", ["d"]),
    commit("d", []),
  ];

  it("fans the second parent out to a new lane", () => {
    const { rows } = layoutGraph(commits);
    const a = rows[0];
    expect(a.lane).toBe(0);
    expect(a.bottomEdges).toContainEqual({
      kind: "branch",
      fromLane: 0,
      toLane: 1,
      color: laneColor(1),
    });
    // The commit's own lane continues to its first parent.
    expect(a.bottomEdges).toContainEqual({
      kind: "straight",
      lane: 0,
      color: laneColor(0),
    });
  });

  it("passes the parallel lane through intermediate rows", () => {
    const { rows } = layoutGraph(commits);
    const b = rows[1];
    expect(b.lane).toBe(0);
    expect(b.topEdges).toEqual([
      { kind: "straight", lane: 0, color: laneColor(0) },
      { kind: "straight", lane: 1, color: laneColor(1) },
    ]);
    expect(b.laneCount).toBe(2);
  });

  it("collapses converging lanes with a merge edge", () => {
    const { rows } = layoutGraph(commits);
    const d = rows[3];
    expect(d.lane).toBe(0);
    expect(d.topEdges).toContainEqual({
      kind: "merge",
      fromLane: 1,
      toLane: 0,
      color: laneColor(1),
    });
    expect(d.topEdges).toContainEqual({
      kind: "straight",
      lane: 0,
      color: laneColor(0),
    });
    expect(d.bottomEdges).toEqual([]);
  });

  it("reuses a lane that already expects a parent", () => {
    // Second merge whose extra parent is already tracked in lane 1.
    const withSecondMerge = [
      commit("m", ["a", "c"]),
      commit("a", ["b", "c"]),
      commit("b", ["d"]),
      commit("c", ["d"]),
      commit("d", []),
    ];
    const { rows } = layoutGraph(withSecondMerge);
    const a = rows[1];
    // c already lives in lane 1; the branch edge targets it instead of
    // allocating a third lane.
    expect(rows.every((r) => r.laneCount <= 2)).toBe(true);
    expect(a.bottomEdges.filter((e) => e.kind === "branch")).toEqual([
      { kind: "branch", fromLane: 0, toLane: 1, color: laneColor(1) },
    ]);
  });

  it("tracks the widest concurrent lane count per row", () => {
    const { rows } = layoutGraph(commits);
    expect(Math.max(...rows.map((r) => r.laneCount))).toBe(2);
  });
});

describe("layoutGraph pagination", () => {
  const all = [
    commit("a", ["b", "c"]),
    commit("b", ["d"]),
    commit("c", ["d"]),
    commit("d", ["e"]),
    commit("e", []),
  ];

  it("produces identical rows when laid out in chunks with carried state", () => {
    const whole = layoutGraph(all);
    const first = layoutGraph(all.slice(0, 2), EMPTY_GRAPH_STATE);
    const second = layoutGraph(all.slice(2), first.state);
    expect([...first.rows, ...second.rows]).toEqual(whole.rows);
    expect(second.state).toEqual(whole.state);
  });

  it("does not mutate the previous state", () => {
    const first = layoutGraph(all.slice(0, 2));
    const snapshot = JSON.parse(JSON.stringify(first.state));
    layoutGraph(all.slice(2), first.state);
    expect(first.state).toEqual(snapshot);
  });
});

describe("layoutGraph disconnected tips", () => {
  it("allocates the leftmost free slot for an unrelated tip", () => {
    // Two independent chains interleaved newest-first.
    const commits = [
      commit("a", ["b"]),
      commit("x", ["y"]),
      commit("b", []),
      commit("y", []),
    ];
    const { rows } = layoutGraph(commits);
    expect(rows[0].lane).toBe(0);
    expect(rows[1].lane).toBe(1);
    expect(rows[2].lane).toBe(0);
    expect(rows[3].lane).toBe(1);
    expect(rows[1].laneCount).toBe(2);
  });

  it("frees trailing lanes after a root commit", () => {
    const commits = [commit("a", ["b"]), commit("b", [])];
    const { state } = layoutGraph(commits);
    expect(state.lanes).toEqual([]);
  });
});
