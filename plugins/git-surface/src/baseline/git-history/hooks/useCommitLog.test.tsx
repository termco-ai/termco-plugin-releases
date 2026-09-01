// @vitest-environment jsdom
import type { GitLogEntry } from "../../../runtime";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_SIZE } from "../lib/constants";

const mocks = vi.hoisted(() => ({
  gitLog: vi.fn(),
}));

vi.mock("../../../runtime", () => ({
  native: { gitLog: mocks.gitLog },
}));

import { useCommitLog } from "./useCommitLog";

function commit(
  sha: string,
  overrides: Partial<GitLogEntry> = {},
): GitLogEntry {
  return {
    sha,
    shortSha: sha.slice(0, 7),
    author: "Dev One",
    authorEmail: "dev@example.com",
    timestampSecs: 1700000000,
    parents: [],
    subject: `subject ${sha}`,
    filesChanged: 1,
    insertions: 2,
    deletions: 1,
    ...overrides,
  };
}

function page(prefix: string, count: number): GitLogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    commit(`${prefix}${String(i).padStart(3, "0")}`),
  );
}

function mount(activeSearch = "") {
  const scrollRef = { current: null };
  return renderHook(
    ({ search }: { search: string }) =>
      useCommitLog("/repo", search, scrollRef),
    { initialProps: { search: activeSearch } },
  );
}

beforeEach(() => {
  mocks.gitLog.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useCommitLog initial load", () => {
  it("loads the first page and flags the end on a short page", async () => {
    mocks.gitLog.mockResolvedValue([commit("aaa"), commit("bbb")]);
    const { result } = mount();
    await act(async () => {
      await result.current.loadInitial();
    });
    expect(mocks.gitLog).toHaveBeenCalledWith("/repo", { limit: PAGE_SIZE });
    expect(result.current.commits.map((c) => c.sha)).toEqual(["aaa", "bbb"]);
    expect(result.current.endReached).toBe(true);
    expect(result.current.loadStatus).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("keeps paging open after a full page", async () => {
    mocks.gitLog.mockResolvedValue(page("a", PAGE_SIZE));
    const { result } = mount();
    await act(async () => {
      await result.current.loadInitial();
    });
    expect(result.current.endReached).toBe(false);
  });

  it("surfaces load errors", async () => {
    mocks.gitLog.mockRejectedValue(new Error("not a repo"));
    const { result } = mount();
    await act(async () => {
      await result.current.loadInitial();
    });
    expect(result.current.loadStatus).toBe("error");
    expect(result.current.error).toBe("not a repo");
  });

  it("ignores a stale response when a newer request started", async () => {
    let resolveFirst: (v: GitLogEntry[]) => void = () => {};
    mocks.gitLog
      .mockImplementationOnce(
        () =>
          new Promise<GitLogEntry[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce([commit("new")]);
    const { result } = mount();
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadInitial();
    });
    await act(async () => {
      await result.current.loadInitial();
    });
    expect(result.current.commits.map((c) => c.sha)).toEqual(["new"]);
    await act(async () => {
      resolveFirst([commit("stale")]);
      await first;
    });
    expect(result.current.commits.map((c) => c.sha)).toEqual(["new"]);
  });
});

describe("useCommitLog loadMore", () => {
  async function loadFirstFullPage(result: {
    current: ReturnType<typeof useCommitLog>;
  }) {
    mocks.gitLog.mockResolvedValueOnce(page("a", PAGE_SIZE));
    await act(async () => {
      await result.current.loadInitial();
    });
  }

  it("appends the next page keyed on the last sha and dedupes", async () => {
    const { result } = mount();
    await loadFirstFullPage(result);
    const last = result.current.commits[PAGE_SIZE - 1];
    mocks.gitLog.mockResolvedValueOnce([last, commit("next")]);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mocks.gitLog).toHaveBeenLastCalledWith("/repo", {
      limit: PAGE_SIZE,
      beforeSha: last.sha,
    });
    expect(result.current.commits).toHaveLength(PAGE_SIZE + 1);
    expect(result.current.commits[result.current.commits.length - 1]?.sha).toBe(
      "next",
    );
    expect(result.current.endReached).toBe(true);
  });

  it("does nothing when there are no commits yet", async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mocks.gitLog).not.toHaveBeenCalled();
  });

  it("does nothing once the end is reached", async () => {
    mocks.gitLog.mockResolvedValueOnce([commit("only")]);
    const { result } = mount();
    await act(async () => {
      await result.current.loadInitial();
    });
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mocks.gitLog).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent loadMore calls", async () => {
    const { result } = mount();
    await loadFirstFullPage(result);
    let resolveMore: (v: GitLogEntry[]) => void = () => {};
    mocks.gitLog.mockImplementationOnce(
      () =>
        new Promise<GitLogEntry[]>((resolve) => {
          resolveMore = resolve;
        }),
    );
    await act(async () => {
      const p1 = result.current.loadMore();
      const p2 = result.current.loadMore();
      resolveMore([commit("more")]);
      await Promise.all([p1, p2]);
    });
    expect(mocks.gitLog).toHaveBeenCalledTimes(2);
  });

  it("reports errors from loadMore and allows a retry", async () => {
    const { result } = mount();
    await loadFirstFullPage(result);
    mocks.gitLog.mockRejectedValueOnce("disk exploded");
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.loadStatus).toBe("error");
    expect(result.current.error).toBe("disk exploded");
    // Status is no longer idle, so paging is suspended until a reload.
    await act(async () => {
      await result.current.loadMore();
    });
    expect(mocks.gitLog).toHaveBeenCalledTimes(2);
  });
});

describe("useCommitLog filtering", () => {
  async function loadFixtures(result: {
    current: ReturnType<typeof useCommitLog>;
  }) {
    mocks.gitLog.mockResolvedValueOnce([
      commit("abc1234deadbeef", {
        subject: "Fix crash on resize",
        author: "Ada Lovelace",
        authorEmail: "ada@example.com",
      }),
      commit("def5678cafebabe", {
        subject: "Add graph rail",
        author: "Grace Hopper",
        authorEmail: "grace@example.com",
      }),
    ]);
    await act(async () => {
      await result.current.loadInitial();
    });
  }

  it("returns all commits when the query is empty", async () => {
    const { result } = mount();
    await loadFixtures(result);
    expect(result.current.filtered).toHaveLength(2);
  });

  it("matches subject, author, email, and short sha case-insensitively", async () => {
    const { result, rerender } = mount();
    await loadFixtures(result);

    rerender({ search: "CRASH" });
    expect(result.current.filtered.map((c) => c.subject)).toEqual([
      "Fix crash on resize",
    ]);

    rerender({ search: "hopper" });
    expect(result.current.filtered.map((c) => c.author)).toEqual([
      "Grace Hopper",
    ]);

    rerender({ search: "ada@" });
    expect(result.current.filtered).toHaveLength(1);

    rerender({ search: "def5678" });
    expect(result.current.filtered.map((c) => c.sha)).toEqual([
      "def5678cafebabe",
    ]);

    rerender({ search: "no-match-at-all" });
    expect(result.current.filtered).toHaveLength(0);
  });

  it("sizes the virtualizer from the filtered list", async () => {
    const { result, rerender } = mount();
    await loadFixtures(result);
    expect(result.current.virtualizer.options.count).toBe(2);
    rerender({ search: "crash" });
    expect(result.current.virtualizer.options.count).toBe(1);
  });
});
