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

import { fetchCommitDiff, fetchWorkingDiff } from "./diffCache";
import {
  type CommitSource,
  cacheKey,
  loadStateFromCache,
  type WorkingSource,
} from "./gitDiffLoadState";

const working: WorkingSource = {
  kind: "working",
  repoRoot: "/repo",
  path: "w.ts",
  mode: "+",
  originalPath: null,
};

const commit: CommitSource = {
  kind: "commit",
  repoRoot: "/repo",
  sha: "abc123",
  path: "c.ts",
  originalPath: null,
};

beforeEach(() => {
  gitDiffContent.mockReset();
  gitCommitFileDiff.mockReset();
});

describe("cacheKey", () => {
  it("derives a working-tree key from repo, mode, and path", () => {
    expect(cacheKey(working)).toBe("local|/repo|w|+|w.ts");
  });

  it("derives a commit key from repo, sha, and path", () => {
    expect(cacheKey(commit)).toBe("local|/repo|c|abc123|c.ts");
  });
});

describe("loadStateFromCache", () => {
  it("returns idle on a cache miss", () => {
    expect(
      loadStateFromCache({ ...working, path: "never-fetched.ts" }),
    ).toEqual({ kind: "idle" });
  });

  it("returns loaded content after a working fetch", async () => {
    gitDiffContent.mockResolvedValueOnce({
      originalContent: "before",
      modifiedContent: "after",
      isBinary: false,
      fallbackPatch: "",
      truncated: false,
    });
    await fetchWorkingDiff(
      working.repoRoot,
      working.path,
      working.mode,
      working.originalPath,
    );
    expect(loadStateFromCache(working)).toEqual({
      kind: "loaded",
      originalContent: "before",
      modifiedContent: "after",
      // A result without states — from an older build — reads as "ok", so it
      // renders exactly as it always did.
      originalState: "ok",
      modifiedState: "ok",
      isBinary: false,
      fallbackPatch: "",
    });
  });

  it("returns loaded content after a commit fetch", async () => {
    gitCommitFileDiff.mockResolvedValueOnce({
      originalContent: "",
      modifiedContent: "",
      isBinary: true,
      fallbackPatch: "Binary files differ",
      truncated: false,
    });
    await fetchCommitDiff(
      commit.repoRoot,
      commit.sha,
      commit.path,
      commit.originalPath,
    );
    expect(loadStateFromCache(commit)).toEqual({
      kind: "loaded",
      originalContent: "",
      modifiedContent: "",
      originalState: "ok",
      modifiedState: "ok",
      isBinary: true,
      fallbackPatch: "Binary files differ",
    });
  });
});
