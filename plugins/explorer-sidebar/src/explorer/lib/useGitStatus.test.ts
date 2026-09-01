// @vitest-environment jsdom
import type { GitChangedFile, GitStatusSnapshot } from "@termco/git-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGitStatus } from "./useGitStatus";
import {
  createTestExplorerRuntime,
  type ExplorerRuntimeMocks,
} from "../../testRuntime";

const workspace: WorkspaceEnv = { kind: "local" };
let runtime: ExplorerRuntimeMocks;

function file(overrides: Partial<GitChangedFile>): GitChangedFile {
  return {
    path: "a.ts",
    originalPath: null,
    indexStatus: " ",
    worktreeStatus: " ",
    staged: false,
    unstaged: false,
    untracked: false,
    statusLabel: "",
    ...overrides,
  };
}

function snapshot(
  repoRoot: string,
  changedFiles: GitChangedFile[],
): GitStatusSnapshot {
  return {
    repoRoot,
    branch: "main",
    upstream: null,
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles,
  };
}

const status = snapshot("/repo", [
  file({ path: "src/a.ts", unstaged: true, worktreeStatus: "M" }),
]);

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createTestExplorerRuntime();
  runtime.files.canonicalize.mockImplementation((p) => Promise.resolve(p));
});

describe("useGitStatus", () => {
  it("returns statuses when the snapshot covers the explorer root", async () => {
    const { result } = renderHook(() =>
      useGitStatus("/repo", workspace, status, true),
    );
    await waitFor(() => {
      expect(result.current.lookup("/repo/src/a.ts")).toBe("M");
    });
    expect(result.current.lookup("/repo/src")).toBe("M");
    expect(result.current.lookup("/repo/other.ts")).toBeNull();
    expect(result.current.lookup("/elsewhere/a.ts")).toBeNull();
  });

  it("covers a workspace root nested inside the repo", async () => {
    const { result } = renderHook(() =>
      useGitStatus("/repo/src", workspace, status, true),
    );
    await waitFor(() => {
      expect(result.current.lookup("/repo/src/a.ts")).toBe("M");
    });
  });

  it("returns null everywhere when disabled", () => {
    const { result } = renderHook(() =>
      useGitStatus("/repo", workspace, status, false),
    );
    expect(result.current.lookup("/repo/src/a.ts")).toBeNull();
    expect(runtime.files.canonicalize).not.toHaveBeenCalled();
  });

  it("returns null when there is no snapshot", () => {
    const { result } = renderHook(() =>
      useGitStatus("/repo", workspace, null, true),
    );
    expect(result.current.lookup("/repo/src/a.ts")).toBeNull();
  });

  it("returns null when the snapshot does not overlap the root", async () => {
    const { result } = renderHook(() =>
      useGitStatus("/unrelated", workspace, status, true),
    );
    await waitFor(() => {
      expect(runtime.files.canonicalize).toHaveBeenCalled();
    });
    expect(result.current.lookup("/unrelated/src/a.ts")).toBeNull();
    expect(result.current.lookup("/repo/src/a.ts")).toBeNull();
  });

  it("matches through the canonicalized alias of a symlinked root", async () => {
    runtime.files.canonicalize.mockResolvedValue("/private/tmp/proj");
    const aliasStatus = snapshot("/private/tmp/proj", [
      file({ path: "a.ts", untracked: true }),
    ]);
    const { result } = renderHook(() =>
      useGitStatus("/tmp/proj", workspace, aliasStatus, true),
    );
    await waitFor(() => {
      expect(result.current.lookup("/tmp/proj/a.ts")).toBe("U");
    });
    expect(result.current.lookup("/private/tmp/proj/a.ts")).toBe("U");
  });

  it("ignores canonicalize failures and keeps the literal root", async () => {
    runtime.files.canonicalize.mockRejectedValue(new Error("gone"));
    const { result } = renderHook(() =>
      useGitStatus("/repo", workspace, status, true),
    );
    await waitFor(() => {
      expect(runtime.files.canonicalize).toHaveBeenCalled();
    });
    expect(result.current.lookup("/repo/src/a.ts")).toBe("M");
  });
});
