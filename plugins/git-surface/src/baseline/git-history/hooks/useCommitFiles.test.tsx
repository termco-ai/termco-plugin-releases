// @vitest-environment jsdom
import type { GitCommitFileChange } from "../../../runtime";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FILES_CACHE_LIMIT } from "../lib/constants";

const mocks = vi.hoisted(() => ({
  gitCommitFiles: vi.fn(),
}));

vi.mock("../../../runtime", () => ({
  native: { gitCommitFiles: mocks.gitCommitFiles },
}));

import { useCommitFiles } from "./useCommitFiles";

function file(path: string): GitCommitFileChange {
  return {
    path,
    originalPath: null,
    status: "M",
    statusLabel: "Modified",
    added: 1,
    removed: 0,
    isBinary: false,
  };
}

function mount(openSha: string | null = null) {
  return renderHook(
    ({ sha }: { sha: string | null }) => useCommitFiles("/repo", sha),
    { initialProps: { sha: openSha } },
  );
}

beforeEach(() => {
  mocks.gitCommitFiles.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useCommitFiles", () => {
  it("exposes no entry when no commit is open", () => {
    const { result } = mount(null);
    expect(result.current.openFilesEntry).toBeNull();
  });

  it("fetches and caches the file list for the open commit", async () => {
    mocks.gitCommitFiles.mockResolvedValue([file("a.ts")]);
    const { result } = mount("sha1");
    await act(async () => {
      await result.current.fetchFiles("sha1");
    });
    expect(mocks.gitCommitFiles).toHaveBeenCalledWith("/repo", "sha1");
    expect(result.current.openFilesEntry).toEqual({
      state: "loaded",
      files: [file("a.ts")],
    });
  });

  it("shows a loading entry while the fetch is in flight", async () => {
    let resolve: (v: GitCommitFileChange[]) => void = () => {};
    mocks.gitCommitFiles.mockImplementation(
      () =>
        new Promise<GitCommitFileChange[]>((r) => {
          resolve = r;
        }),
    );
    const { result } = mount("sha1");
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.fetchFiles("sha1");
    });
    expect(result.current.openFilesEntry).toEqual({ state: "loading" });
    await act(async () => {
      resolve([]);
      await pending;
    });
    expect(result.current.openFilesEntry).toEqual({
      state: "loaded",
      files: [],
    });
  });

  it("does not refetch a loaded commit", async () => {
    mocks.gitCommitFiles.mockResolvedValue([]);
    const { result } = mount("sha1");
    await act(async () => {
      await result.current.fetchFiles("sha1");
      await result.current.fetchFiles("sha1");
    });
    expect(mocks.gitCommitFiles).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent fetches for the same sha", async () => {
    let resolve: (v: GitCommitFileChange[]) => void = () => {};
    mocks.gitCommitFiles.mockImplementation(
      () =>
        new Promise<GitCommitFileChange[]>((r) => {
          resolve = r;
        }),
    );
    const { result } = mount("sha1");
    await act(async () => {
      const p1 = result.current.fetchFiles("sha1");
      const p2 = result.current.fetchFiles("sha1");
      resolve([]);
      await Promise.all([p1, p2]);
    });
    expect(mocks.gitCommitFiles).toHaveBeenCalledTimes(1);
  });

  it("stores errors and allows refetching after one", async () => {
    mocks.gitCommitFiles.mockRejectedValueOnce(new Error("boom"));
    const { result } = mount("sha1");
    await act(async () => {
      await result.current.fetchFiles("sha1");
    });
    expect(result.current.openFilesEntry).toEqual({
      state: "error",
      error: "boom",
    });
    mocks.gitCommitFiles.mockResolvedValueOnce([file("b.ts")]);
    await act(async () => {
      await result.current.fetchFiles("sha1");
    });
    expect(result.current.openFilesEntry).toEqual({
      state: "loaded",
      files: [file("b.ts")],
    });
  });

  it("evicts the oldest entries beyond the cache limit", async () => {
    mocks.gitCommitFiles.mockResolvedValue([]);
    const { result, rerender } = mount("sha0");
    await act(async () => {
      for (let i = 0; i <= FILES_CACHE_LIMIT; i++) {
        await result.current.fetchFiles(`sha${i}`);
      }
    });
    rerender({ sha: "sha0" });
    expect(result.current.openFilesEntry).toBeNull();
    rerender({ sha: `sha${FILES_CACHE_LIMIT}` });
    expect(result.current.openFilesEntry).toEqual({
      state: "loaded",
      files: [],
    });
  });

  it("resetFiles clears the cache", async () => {
    mocks.gitCommitFiles.mockResolvedValue([]);
    const { result } = mount("sha1");
    await act(async () => {
      await result.current.fetchFiles("sha1");
    });
    act(() => {
      result.current.resetFiles();
    });
    expect(result.current.openFilesEntry).toBeNull();
  });
});
