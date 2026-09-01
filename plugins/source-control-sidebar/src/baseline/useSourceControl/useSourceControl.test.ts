// @vitest-environment jsdom
import type {
  GitPanelSnapshot,
  GitRepoInfo,
  GitStatusSnapshot,
} from "@termco/git-base";
import { native } from "../../runtime";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceControl } from "./useSourceControl";

vi.mock("../../runtime", () => ({
  native: {
    gitStatus: vi.fn(),
    gitPanelSnapshot: vi.fn(),
    gitFetch: vi.fn(),
    gitPullFfOnly: vi.fn(),
    gitPush: vi.fn(),
  },
  setSourceControlWorkspace: vi.fn(),
}));

function repoInfo(overrides: Partial<GitRepoInfo> = {}): GitRepoInfo {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    isDetached: false,
    ...overrides,
  };
}

function status(overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
    ...overrides,
  };
}

function panelSnapshot(
  overrides: Partial<GitPanelSnapshot> = {},
): GitPanelSnapshot {
  return { repo: repoInfo(), status: status(), ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(native.gitPanelSnapshot).mockResolvedValue(panelSnapshot());
  vi.mocked(native.gitStatus).mockResolvedValue(status());
  vi.mocked(native.gitFetch).mockResolvedValue(undefined);
  vi.mocked(native.gitPullFfOnly).mockResolvedValue(undefined);
  vi.mocked(native.gitPush).mockResolvedValue({
    remote: "origin",
    branch: "main",
    pushed: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSourceControl", () => {
  it("loads the repo snapshot for the context path", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    expect(native.gitPanelSnapshot).toHaveBeenCalledWith("/repo");
    expect(result.current.repo?.repoRoot).toBe("/repo");
    expect(result.current.status?.branch).toBe("main");
    expect(result.current.upstream).toBe("origin/main");
    expect(result.current.changedCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.localError).toBeNull();
  });

  it("reports no repo without a context path", async () => {
    const { result } = renderHook(() => useSourceControl(null));
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.hasRepo).toBe(false);
    expect(native.gitPanelSnapshot).not.toHaveBeenCalled();
  });

  it("reports no repo when the snapshot has none", async () => {
    vi.mocked(native.gitPanelSnapshot).mockResolvedValue({
      repo: null,
      status: null,
    });
    const { result } = renderHook(() => useSourceControl("/not-a-repo"));
    await waitFor(() => {
      expect(native.gitPanelSnapshot).toHaveBeenCalled();
    });
    expect(result.current.hasRepo).toBe(false);
    expect(result.current.repo).toBeNull();
  });

  it("surfaces snapshot failures as localError", async () => {
    vi.mocked(native.gitPanelSnapshot).mockRejectedValue(
      new Error("git broke"),
    );
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.localError).toBe("git broke");
    });
    expect(result.current.hasRepo).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it("stays cleared while disabled", async () => {
    const { result } = renderHook(() => useSourceControl("/repo", false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.hasRepo).toBe(false);
    expect(native.gitPanelSnapshot).not.toHaveBeenCalled();
  });

  it("reuses the loaded repo root via gitStatus for paths inside the repo", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    vi.mocked(native.gitStatus).mockResolvedValue(status({ ahead: 1 }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(native.gitStatus).toHaveBeenCalledWith("/repo");
    expect(native.gitPanelSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.ahead).toBe(1);
  });

  it("falls back to a fresh snapshot when the reused status call fails", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    vi.mocked(native.gitStatus).mockRejectedValueOnce(new Error("stale"));
    vi.mocked(native.gitPanelSnapshot).mockResolvedValue(
      panelSnapshot({ repo: repoInfo({ branch: "next" }) }),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(native.gitPanelSnapshot).toHaveBeenCalledTimes(2);
    expect(result.current.repo?.branch).toBe("next");
  });

  it("skips the refetch when the data is fresh and the path stays in the repo", async () => {
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useSourceControl(path),
      { initialProps: { path: "/repo" } },
    );
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    rerender({ path: "/repo/src" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(native.gitPanelSnapshot).toHaveBeenCalledTimes(1);
    expect(native.gitStatus).not.toHaveBeenCalled();
  });

  it("auto-fetches on remote refresh and refreshes the status", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    vi.mocked(native.gitStatus).mockResolvedValue(status({ behind: 2 }));
    await act(async () => {
      await result.current.refresh({ remote: "always" });
    });
    expect(native.gitFetch).toHaveBeenCalledWith("/repo");
    expect(result.current.behind).toBe(2);
    expect(result.current.lastRemoteError).toBeNull();
  });

  it("keeps local data and records the error when auto-fetch fails", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    vi.mocked(native.gitFetch).mockRejectedValue(new Error("offline"));
    await act(async () => {
      await result.current.refresh({ remote: "always" });
    });
    expect(result.current.lastRemoteError).toBe("offline");
    expect(result.current.hasRepo).toBe(true);
  });

  it("dedupes concurrent refreshes with the same remote mode", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    await act(async () => {
      const first = result.current.refresh();
      const second = result.current.refresh();
      await Promise.all([first, second]);
    });
    expect(native.gitStatus).toHaveBeenCalledTimes(1);
  });

  it("applies optimistic status updates and ignores identity updates", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    act(() => {
      result.current.applyStatus((current) => ({ ...current, ahead: 9 }));
    });
    expect(result.current.ahead).toBe(9);
    const before = result.current.status;
    act(() => {
      result.current.applyStatus((current) => current);
    });
    expect(result.current.status).toBe(before);
  });

  it("throttles auto fetches per repo but honors explicit ones", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    await act(async () => {
      await result.current.refresh({ remote: "auto" });
    });
    expect(native.gitFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refresh({ remote: "auto" });
    });
    expect(native.gitFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refresh({ remote: "always" });
    });
    expect(native.gitFetch).toHaveBeenCalledTimes(2);
  });

  it("upgrades an in-flight refresh to include the remote fetch", async () => {
    const { result } = renderHook(() => useSourceControl("/repo"));
    await waitFor(() => {
      expect(result.current.hasRepo).toBe(true);
    });
    vi.mocked(native.gitStatus).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(status()), 10);
        }),
    );
    await act(async () => {
      const first = result.current.refresh();
      const second = result.current.refresh({ remote: "always" });
      await Promise.all([first, second]);
    });
    expect(native.gitFetch).toHaveBeenCalledTimes(1);
  });

  it("schedules the initial load through requestIdleCallback when present", async () => {
    const idle = vi.fn((cb: IdleRequestCallback) => {
      cb({} as IdleDeadline);
      return 7;
    });
    const cancelIdle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    try {
      const { result, unmount } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      expect(idle).toHaveBeenCalled();
      unmount();
      expect(cancelIdle).toHaveBeenCalledWith(7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("debounces focus refreshes and skips them right after a refresh", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSourceControl("/repo"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(result.current.hasRepo).toBe(true);

    window.dispatchEvent(new Event("focus"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(native.gitStatus).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    window.dispatchEvent(new Event("focus"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(native.gitStatus).toHaveBeenCalledTimes(1);
  });

  describe("runRemoteAction", () => {
    it("is blocked without a repo", async () => {
      vi.mocked(native.gitPanelSnapshot).mockResolvedValue({
        repo: null,
        status: null,
      });
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(native.gitPanelSnapshot).toHaveBeenCalled();
      });
      const outcome = await result.current.runRemoteAction();
      expect(outcome).toEqual({ ok: false, action: null, blocked: "no-repo" });
    });

    it("is blocked without an upstream", async () => {
      vi.mocked(native.gitPanelSnapshot).mockResolvedValue(
        panelSnapshot({
          repo: repoInfo({ upstream: null }),
          status: status({ upstream: null }),
        }),
      );
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      const outcome = await result.current.runRemoteAction();
      expect(outcome).toEqual({
        ok: false,
        action: null,
        blocked: "missing-upstream",
      });
    });

    it("is blocked contextually when the branch diverged", async () => {
      vi.mocked(native.gitPanelSnapshot).mockResolvedValue(
        panelSnapshot({ status: status({ ahead: 1, behind: 1 }) }),
      );
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      const outcome = await result.current.runRemoteAction();
      expect(outcome).toEqual({
        ok: false,
        action: null,
        blocked: "diverged",
      });
      expect(native.gitPush).not.toHaveBeenCalled();
    });

    it("pushes explicitly and refreshes afterwards", async () => {
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      let outcome: Awaited<
        ReturnType<typeof result.current.runRemoteAction>
      > | null = null;
      await act(async () => {
        outcome = await result.current.runRemoteAction("push");
      });
      expect(outcome).toEqual({ ok: true, action: "push" });
      expect(native.gitPush).toHaveBeenCalledWith("/repo");
      expect(result.current.busyAction).toBeNull();
    });

    it("resolves the contextual action to pull when behind", async () => {
      vi.mocked(native.gitPanelSnapshot).mockResolvedValue(
        panelSnapshot({ status: status({ behind: 2 }) }),
      );
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      await act(async () => {
        await result.current.runRemoteAction();
      });
      expect(native.gitFetch).toHaveBeenCalledWith("/repo");
      expect(native.gitPullFfOnly).toHaveBeenCalledWith("/repo");
    });

    it("resolves the contextual action to fetch when in sync", async () => {
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      await act(async () => {
        await result.current.runRemoteAction();
      });
      expect(native.gitFetch).toHaveBeenCalledWith("/repo");
      expect(native.gitPullFfOnly).not.toHaveBeenCalled();
      expect(native.gitPush).not.toHaveBeenCalled();
    });

    it("records failures and clears the busy state", async () => {
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      vi.mocked(native.gitPush).mockRejectedValue(new Error("rejected"));
      let outcome: Awaited<
        ReturnType<typeof result.current.runRemoteAction>
      > | null = null;
      await act(async () => {
        outcome = await result.current.runRemoteAction("push");
      });
      expect(outcome).toEqual({
        ok: false,
        action: "push",
        error: "rejected",
      });
      expect(result.current.busyAction).toBeNull();
    });

    it("keeps the just-recorded push error across the follow-up refresh", async () => {
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      vi.mocked(native.gitPush).mockRejectedValue(new Error("rejected"));
      await act(async () => {
        await result.current.runRemoteAction("push");
      });
      expect(result.current.lastRemoteError).toBe("rejected");
    });

    it("clears a previous remote error across the refresh after a successful push", async () => {
      const { result } = renderHook(() => useSourceControl("/repo"));
      await waitFor(() => {
        expect(result.current.hasRepo).toBe(true);
      });
      vi.mocked(native.gitPush).mockRejectedValueOnce(new Error("rejected"));
      await act(async () => {
        await result.current.runRemoteAction("push");
      });
      expect(result.current.lastRemoteError).toBe("rejected");
      await act(async () => {
        await result.current.runRemoteAction("push");
      });
      expect(result.current.lastRemoteError).toBeNull();
    });
  });
});
