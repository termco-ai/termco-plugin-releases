// @vitest-environment jsdom
import type { GitLogEntry } from "../../../runtime";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCommitGraph } from "./useCommitGraph";

afterEach(() => {
  cleanup();
});

function commit(sha: string, parents: string[]): GitLogEntry {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: "Dev",
    authorEmail: "dev@example.com",
    timestampSecs: 1700000000,
    parents,
    subject: sha,
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
  };
}

function mount(initial: GitLogEntry[]) {
  return renderHook(
    ({ commits }: { commits: GitLogEntry[] }) => useCommitGraph(commits),
    { initialProps: { commits: initial } },
  );
}

describe("useCommitGraph", () => {
  it("returns an empty graph for no commits", () => {
    const { result } = mount([]);
    expect(result.current.graphByCommit.size).toBe(0);
    expect(result.current.maxLaneCount).toBe(1);
  });

  it("lays out rows keyed by sha", () => {
    const { result } = mount([commit("a", ["b"]), commit("b", [])]);
    expect(result.current.graphByCommit.size).toBe(2);
    expect(result.current.graphByCommit.get("a")?.lane).toBe(0);
    expect(result.current.graphByCommit.get("b")?.lane).toBe(0);
    expect(result.current.maxLaneCount).toBe(1);
  });

  it("appends new pages incrementally without relayout", () => {
    const first = [commit("a", ["b"]), commit("b", ["c"])];
    const { result, rerender } = mount(first);
    const rowA = result.current.graphByCommit.get("a");
    rerender({ commits: [...first, commit("c", [])] });
    expect(result.current.graphByCommit.size).toBe(3);
    // Existing rows are reused, not recomputed.
    expect(result.current.graphByCommit.get("a")).toBe(rowA);
  });

  it("matches a from-scratch layout after appending", () => {
    const all = [
      commit("m", ["a", "c"]),
      commit("a", ["b"]),
      commit("c", ["d"]),
      commit("b", ["d"]),
      commit("d", []),
    ];
    const { result, rerender } = mount(all.slice(0, 2));
    rerender({ commits: all });
    const fresh = mount(all);
    for (const sha of ["m", "a", "c", "b", "d"]) {
      expect(result.current.graphByCommit.get(sha)).toEqual(
        fresh.result.current.graphByCommit.get(sha),
      );
    }
    expect(result.current.maxLaneCount).toBe(fresh.result.current.maxLaneCount);
  });

  it("recomputes when the head commit changes", () => {
    const { result, rerender } = mount([commit("a", ["b"]), commit("b", [])]);
    const oldMap = result.current.graphByCommit;
    rerender({ commits: [commit("z", ["b"]), commit("b", [])] });
    expect(result.current.graphByCommit).not.toBe(oldMap);
    expect(result.current.graphByCommit.has("z")).toBe(true);
    expect(result.current.graphByCommit.has("a")).toBe(false);
  });

  it("recomputes when the list shrinks under the same head", () => {
    const all = [commit("a", ["b"]), commit("b", ["c"]), commit("c", [])];
    const { result, rerender } = mount(all);
    rerender({ commits: all.slice(0, 2) });
    expect(result.current.graphByCommit.size).toBe(2);
  });

  it("resets the cache when commits empty out", () => {
    const { result, rerender } = mount([commit("a", [])]);
    rerender({ commits: [] });
    expect(result.current.graphByCommit.size).toBe(0);
    expect(result.current.maxLaneCount).toBe(1);
  });

  it("tracks the widest lane count across pages", () => {
    const wide = [
      commit("m", ["a", "b"]),
      commit("a", ["r"]),
      commit("b", ["r"]),
      commit("r", []),
    ];
    const { result, rerender } = mount(wide.slice(0, 2));
    rerender({ commits: wide });
    expect(result.current.maxLaneCount).toBe(2);
  });
});
