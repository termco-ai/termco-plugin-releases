import type { GitDiffContentResult } from "../../../runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gitDiffContent = vi.fn();
const gitCommitFileDiff = vi.fn();

vi.mock("../../../runtime", () => ({
  currentWorkspaceScopeKey: () => "local",
  native: {
    gitDiffContent: (...args: unknown[]) => gitDiffContent(...args),
    gitCommitFileDiff: (...args: unknown[]) => gitCommitFileDiff(...args),
  },
}));

import {
  commitDiffKey,
  fetchCommitDiff,
  fetchWorkingDiff,
  getCachedDiff,
  invalidateDiff,
  invalidateRepoDiffs,
  workingDiffKey,
} from "./diffCache";

function result(marker: string): GitDiffContentResult {
  return {
    originalContent: `orig-${marker}`,
    modifiedContent: `mod-${marker}`,
    isBinary: false,
    fallbackPatch: "",
    truncated: false,
  };
}

let n = 0;
function uniquePath(): string {
  n += 1;
  return `file-${n}.ts`;
}

beforeEach(() => {
  gitDiffContent.mockReset();
  gitCommitFileDiff.mockReset();
});

describe("diff cache keys", () => {
  it("scopes working keys by workspace, repo, mode, and path", () => {
    expect(workingDiffKey("/repo", "a.ts", "+")).toBe("local|/repo|w|+|a.ts");
    expect(workingDiffKey("/repo", "a.ts", "-")).toBe("local|/repo|w|-|a.ts");
  });

  it("scopes commit keys by workspace, repo, sha, and path", () => {
    expect(commitDiffKey("/repo", "abc123", "a.ts")).toBe(
      "local|/repo|c|abc123|a.ts",
    );
  });
});

describe("fetchWorkingDiff", () => {
  it("fetches, caches, and passes staged=true for mode +", async () => {
    const path = uniquePath();
    gitDiffContent.mockResolvedValueOnce(result("w1"));
    const res = await fetchWorkingDiff("/repo", path, "+", null);
    expect(res).toEqual(result("w1"));
    expect(gitDiffContent).toHaveBeenCalledWith("/repo", path, true, null);
    expect(getCachedDiff(workingDiffKey("/repo", path, "+"))).toEqual(
      result("w1"),
    );
  });

  it("passes staged=false for mode - and forwards originalPath", async () => {
    const path = uniquePath();
    gitDiffContent.mockResolvedValueOnce(result("w2"));
    await fetchWorkingDiff("/repo", path, "-", "old.ts");
    expect(gitDiffContent).toHaveBeenCalledWith("/repo", path, false, "old.ts");
  });

  it("returns the cached result without re-fetching", async () => {
    const path = uniquePath();
    gitDiffContent.mockResolvedValueOnce(result("w3"));
    await fetchWorkingDiff("/repo", path, "+", null);
    const again = await fetchWorkingDiff("/repo", path, "+", null);
    expect(again).toEqual(result("w3"));
    expect(gitDiffContent).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent in-flight requests", async () => {
    const path = uniquePath();
    let resolve: (r: GitDiffContentResult) => void = () => {};
    gitDiffContent.mockReturnValueOnce(
      new Promise<GitDiffContentResult>((r) => {
        resolve = r;
      }),
    );
    const p1 = fetchWorkingDiff("/repo", path, "+", null);
    const p2 = fetchWorkingDiff("/repo", path, "+", null);
    resolve(result("w4"));
    expect(await p1).toEqual(result("w4"));
    expect(await p2).toEqual(result("w4"));
    expect(gitDiffContent).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const path = uniquePath();
    gitDiffContent.mockRejectedValueOnce(new Error("boom"));
    await expect(fetchWorkingDiff("/repo", path, "+", null)).rejects.toThrow(
      "boom",
    );
    gitDiffContent.mockResolvedValueOnce(result("w5"));
    await expect(fetchWorkingDiff("/repo", path, "+", null)).resolves.toEqual(
      result("w5"),
    );
    expect(gitDiffContent).toHaveBeenCalledTimes(2);
  });
});

describe("fetchCommitDiff", () => {
  it("fetches through gitCommitFileDiff and caches", async () => {
    const path = uniquePath();
    gitCommitFileDiff.mockResolvedValueOnce(result("c1"));
    const res = await fetchCommitDiff("/repo", "sha1", path, null);
    expect(res).toEqual(result("c1"));
    expect(gitCommitFileDiff).toHaveBeenCalledWith("/repo", "sha1", path, null);
    const again = await fetchCommitDiff("/repo", "sha1", path, null);
    expect(again).toEqual(result("c1"));
    expect(gitCommitFileDiff).toHaveBeenCalledTimes(1);
  });
});

describe("invalidation and eviction", () => {
  it("invalidateDiff drops a single key", async () => {
    const path = uniquePath();
    gitDiffContent.mockResolvedValueOnce(result("i1"));
    await fetchWorkingDiff("/repo", path, "+", null);
    const key = workingDiffKey("/repo", path, "+");
    expect(getCachedDiff(key)).toBeTruthy();
    invalidateDiff(key);
    expect(getCachedDiff(key)).toBeUndefined();
  });

  it("invalidateRepoDiffs drops only that repo's entries", async () => {
    const pathA = uniquePath();
    const pathB = uniquePath();
    gitDiffContent.mockResolvedValue(result("i2"));
    await fetchWorkingDiff("/repo-a", pathA, "+", null);
    await fetchWorkingDiff("/repo-b", pathB, "+", null);
    invalidateRepoDiffs("/repo-a");
    expect(getCachedDiff(workingDiffKey("/repo-a", pathA, "+"))).toBe(
      undefined,
    );
    expect(getCachedDiff(workingDiffKey("/repo-b", pathB, "+"))).toBeTruthy();
  });

  it("evicts the least recently used entry past the cache limit", async () => {
    gitDiffContent.mockResolvedValue(result("e"));
    const paths = Array.from({ length: 7 }, () => uniquePath());
    for (const p of paths) {
      await fetchWorkingDiff("/evict", p, "+", null);
    }
    // Cache limit is 6: the first of the 7 entries must be gone.
    expect(getCachedDiff(workingDiffKey("/evict", paths[0], "+"))).toBe(
      undefined,
    );
    expect(getCachedDiff(workingDiffKey("/evict", paths[6], "+"))).toBeTruthy();
  });

  it("getCachedDiff refreshes recency", async () => {
    gitDiffContent.mockResolvedValue(result("r"));
    const paths = Array.from({ length: 6 }, () => uniquePath());
    for (const p of paths) {
      await fetchWorkingDiff("/recency", p, "+", null);
    }
    // Touch the oldest, then insert one more; the touched entry survives.
    getCachedDiff(workingDiffKey("/recency", paths[0], "+"));
    await fetchWorkingDiff("/recency", uniquePath(), "+", null);
    expect(
      getCachedDiff(workingDiffKey("/recency", paths[0], "+")),
    ).toBeTruthy();
    expect(getCachedDiff(workingDiffKey("/recency", paths[1], "+"))).toBe(
      undefined,
    );
  });
});
