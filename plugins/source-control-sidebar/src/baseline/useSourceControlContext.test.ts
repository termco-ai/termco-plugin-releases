// @vitest-environment jsdom
import { native } from "../runtime";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceControlSummary } from "./useSourceControl";
import { useSourceControlContext } from "./useSourceControlContext";

vi.mock("../runtime", () => ({
  native: { gitResolveRepo: vi.fn() },
}));

const useSourceControlMock = vi.fn();
vi.mock("./useSourceControl", () => ({
  useSourceControl: (...args: unknown[]) => useSourceControlMock(...args),
}));

type Tab = {
  kind: string;
  path?: string;
  repoRoot?: string;
  [key: string]: unknown;
};

function summary(
  overrides: Partial<SourceControlSummary> = {},
): SourceControlSummary {
  return {
    repo: null,
    status: null,
    changedCount: 0,
    upstream: null,
    ahead: 0,
    behind: 0,
    hasRepo: false,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
    applyStatus: vi.fn(),
    refresh: vi.fn(async () => {}),
    runRemoteAction: vi.fn(async () => ({
      ok: false,
      action: null,
    })),
    ...overrides,
  };
}

function terminalTab(): Tab {
  return {
    kind: "terminal",
  };
}

function editorTab(path: string): Tab {
  return {
    id: 2,
    kind: "editor",
    title: "a.ts",
    path,
    dirty: false,
    preview: false,
    rigId: "default",
  };
}

function gitDiffTab(repoRoot: string): Tab {
  return {
    id: 3,
    kind: "git-diff",
    title: "diff",
    path: "a.ts",
    repoRoot,
    mode: "-",
    originalPath: null,
    rigId: "default",
  };
}

type Params = Parameters<typeof useSourceControlContext>[0];

function makeParams(overrides: Partial<Params> = {}): Params {
  return {
    activeTab: undefined,
    tabs: [],
    activeTerminalLeafCwd: null,
    explorerRoot: "/explorer",
    launchCwd: "/launch",
    launchCwdResolved: true,
    home: "/home/user",
    sidebarView: "explorer",
    cycleSidebarView: vi.fn(),
    openCommitHistoryTab: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useSourceControlMock.mockReturnValue(summary());
});

afterEach(cleanup);

function lastContextPath(): string | null {
  const calls = useSourceControlMock.mock.calls;
  return calls[calls.length - 1][0];
}

describe("context path resolution", () => {
  it("tracks the ambient explorer root when source control is inactive", () => {
    renderHook(() => useSourceControlContext(makeParams()));
    expect(lastContextPath()).toBe("/explorer");
  });

  it("falls back to launch cwd then home when there is no explorer root", () => {
    renderHook(() =>
      useSourceControlContext(makeParams({ explorerRoot: null })),
    );
    expect(lastContextPath()).toBe("/launch");

    renderHook(() =>
      useSourceControlContext(
        makeParams({ explorerRoot: null, launchCwd: null }),
      ),
    );
    expect(lastContextPath()).toBe("/home/user");
  });

  it("stays null before the launch cwd resolves", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({ explorerRoot: null, launchCwdResolved: false }),
      ),
    );
    expect(lastContextPath()).toBeNull();
  });

  it("uses the terminal leaf cwd when the panel is active", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: terminalTab(),
          activeTerminalLeafCwd: "/repo/sub",
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/repo/sub");
  });

  it("uses the editor file directory, normalizing backslashes", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: editorTab("C:\\repo\\src\\a.ts"),
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("C:/repo/src");
  });

  it("uses the repo root of git tabs when active", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: gitDiffTab("/repo"),
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/repo");
  });

  it("uses the repo root of history and commit-file tabs when active", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: {
            id: 4,
            kind: "git-history",
            title: "History",
            repoRoot: "/repo-history",
            rigId: "default",
          } as Tab,
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/repo-history");

    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: {
            id: 5,
            kind: "git-commit-file",
            title: "commit",
            repoRoot: "/repo-commit",
            sha: "abc",
            shortSha: "abc",
            subject: "s",
            path: "a.ts",
            originalPath: null,
            rigId: "default",
          } as Tab,
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/repo-commit");
  });

  it("falls back from the terminal leaf cwd to the explorer root", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: terminalTab(),
          activeTerminalLeafCwd: null,
          sidebarView: "source-control",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/explorer");
  });

  it("activates via an open git tab even when the sidebar shows another view", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: gitDiffTab("/repo"),
          tabs: [gitDiffTab("/repo")],
          sidebarView: "explorer",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/repo");
  });

  it("uses the badge path when a git tab is open but another tab is active", () => {
    renderHook(() =>
      useSourceControlContext(
        makeParams({
          activeTab: terminalTab(),
          activeTerminalLeafCwd: "/somewhere",
          tabs: [gitDiffTab("/repo")],
          sidebarView: "explorer",
        }),
      ),
    );
    expect(lastContextPath()).toBe("/somewhere");
  });
});

describe("toggleSourceControl", () => {
  it("cycles the sidebar to source control", () => {
    const params = makeParams();
    const { result } = renderHook(() => useSourceControlContext(params));
    result.current.toggleSourceControl();
    expect(params.cycleSidebarView).toHaveBeenCalledWith("source-control");
  });
});

describe("openGitGraphFromContext", () => {
  it("opens directly from a known repo", async () => {
    useSourceControlMock.mockReturnValue(
      summary({
        hasRepo: true,
        repo: {
          repoRoot: "/repo",
          branch: "main",
          upstream: null,
          isDetached: false,
        },
        status: {
          repoRoot: "/repo",
          branch: "feature",
          upstream: null,
          ahead: 0,
          behind: 0,
          isDetached: false,
          truncated: false,
          changedFiles: [],
        },
      }),
    );
    const params = makeParams();
    const { result } = renderHook(() => useSourceControlContext(params));
    await result.current.openGitGraphFromContext();
    expect(params.openCommitHistoryTab).toHaveBeenCalledWith({
      repoRoot: "/repo",
      branch: "feature",
    });
    expect(native.gitResolveRepo).not.toHaveBeenCalled();
  });

  it("resolves the repo from the context path when unknown", async () => {
    vi.mocked(native.gitResolveRepo).mockResolvedValue({
      repoRoot: "/resolved",
      branch: "main",
      upstream: null,
      isDetached: false,
    });
    const params = makeParams();
    const { result } = renderHook(() => useSourceControlContext(params));
    await result.current.openGitGraphFromContext();
    expect(native.gitResolveRepo).toHaveBeenCalledWith("/explorer");
    expect(params.openCommitHistoryTab).toHaveBeenCalledWith({
      repoRoot: "/resolved",
      branch: "main",
    });
  });

  it("does nothing when no repo resolves", async () => {
    vi.mocked(native.gitResolveRepo).mockResolvedValue(null);
    const params = makeParams();
    const { result } = renderHook(() => useSourceControlContext(params));
    await result.current.openGitGraphFromContext();
    expect(params.openCommitHistoryTab).not.toHaveBeenCalled();
  });

  it("swallows resolve failures", async () => {
    vi.mocked(native.gitResolveRepo).mockRejectedValue(new Error("no git"));
    const params = makeParams();
    const { result } = renderHook(() => useSourceControlContext(params));
    await expect(
      result.current.openGitGraphFromContext(),
    ).resolves.toBeUndefined();
    expect(params.openCommitHistoryTab).not.toHaveBeenCalled();
  });

  it("does nothing without a context path", async () => {
    const params = makeParams({
      explorerRoot: null,
      launchCwd: null,
      home: null,
    });
    const { result } = renderHook(() => useSourceControlContext(params));
    await result.current.openGitGraphFromContext();
    expect(native.gitResolveRepo).not.toHaveBeenCalled();
    expect(params.openCommitHistoryTab).not.toHaveBeenCalled();
  });
});
