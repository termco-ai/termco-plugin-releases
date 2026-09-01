// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { GitStatusSnapshot } from "@termco/git-base";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { SourceControlPanel } from "./SourceControlPanel";
import type { SourceControlSummary } from "./useSourceControl";
import type {
  SourceControlFileEntry,
  SourceControlPanelState,
} from "./useSourceControlPanel/types";

vi.mock("../runtime", () => ({
  native: {
    gitListBranches: vi.fn(async () => ({ branches: [] })),
    gitCheckoutBranch: vi.fn(async () => {}),
  },
  fileIconUrl: vi.fn(() => null),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./lib/featureHelpers", () => ({
  copyToClipboard: vi.fn(async () => {}),
  revealInFinder: vi.fn(async () => {}),
  joinPath: (a: string, b: string) => `${a}/${b}`,
  COMPACT_CONTENT: "",
  COMPACT_ITEM: "",
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getTotalSize: () => opts.count * 30,
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        key: index,
        size: 30,
        start: index * 30,
      })),
    scrollToIndex: vi.fn(),
  }),
}));

const useSourceControlPanelMock = vi.fn();
vi.mock("./useSourceControlPanel", () => ({
  useSourceControlPanel: (...args: unknown[]) =>
    useSourceControlPanelMock(...args),
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

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

function fileEntry(path: string): SourceControlFileEntry {
  return {
    key: path,
    path,
    originalPath: null,
    statusCode: "M",
    statusLabel: "Modified",
    checkState: "unchecked",
    staged: false,
    unstaged: true,
    untracked: false,
  };
}

function makeScm(
  overrides: Partial<SourceControlPanelState> = {},
): SourceControlPanelState {
  return {
    panelState: "ready",
    repo: {
      repoRoot: "/repo",
      branch: "main",
      upstream: "origin/main",
      isDetached: false,
    },
    status: status(),
    selected: null,
    commitMessage: "",
    actionBusy: null,
    statusError: null,
    actionError: null,
    remoteError: null,
    actionMessage: null,
    stagedEntries: [],
    unstagedEntries: [],
    fileEntries: [],
    headerCheckState: "unchecked",
    allClean: true,
    canPush: true,
    pushHint: "Pushes to origin/main.",
    canGenerateCommitMessage: true,
    generateCommitMessageHint: "Generate commit message",
    selectionTransition: "none",
    stagedEmptyText: "No staged changes",
    unstagedEmptyText: "No unstaged changes",
    pendingDiscard: null,
    setCommitMessage: vi.fn(),
    refresh: vi.fn(async () => {}),
    selectEntry: vi.fn(async () => {}),
    selectFile: vi.fn(async () => {}),
    stageEntry: vi.fn(async () => {}),
    unstageEntry: vi.fn(async () => {}),
    toggleStageFile: vi.fn(async () => {}),
    toggleAll: vi.fn(async () => {}),
    requestDiscardEntry: vi.fn(),
    requestDiscardFile: vi.fn(),
    requestDiscardAll: vi.fn(),
    confirmPendingDiscard: vi.fn(async () => {}),
    cancelPendingDiscard: vi.fn(),
    stageAllEntries: vi.fn(async () => {}),
    unstageAllEntries: vi.fn(async () => {}),
    generateCommitMessage: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    push: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<SourceControlSummary> = {},
): SourceControlSummary {
  return {
    repo: null,
    status: null,
    changedCount: 0,
    upstream: null,
    ahead: 0,
    behind: 0,
    hasRepo: true,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
    applyStatus: vi.fn(),
    refresh: vi.fn(async () => {}),
    runRemoteAction: vi.fn(async () => ({
      ok: true,
      action: "fetch" as const,
    })),
    ...overrides,
  };
}

function renderPanel(options: {
  scm: SourceControlPanelState;
  open?: boolean;
  summary?: SourceControlSummary;
  onOpenGitGraph?: () => void;
}) {
  useSourceControlPanelMock.mockReturnValue(options.scm);
  const summary = options.summary ?? makeSummary();
  const onOpenDiff = vi.fn();
  render(
    <SourceControlPanel
      open={options.open ?? true}
      sourceControl={summary}
      onOpenGitGraph={options.onOpenGitGraph}
      onOpenDiff={onOpenDiff}
    />,
  );
  return { summary, onOpenDiff };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SourceControlPanel states", () => {
  it("renders nothing while closed", () => {
    const { container } = (() => {
      useSourceControlPanelMock.mockReturnValue(makeScm());
      return render(
        <SourceControlPanel
          open={false}
          sourceControl={makeSummary()}
          onOpenDiff={vi.fn()}
        />,
      );
    })();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the loading state with the generic panel label", () => {
    renderPanel({ scm: makeScm({ panelState: "loading", status: null }) });
    expect(screen.getByText("Loading repository")).toBeInTheDocument();
    expect(screen.getByText("Source Control")).toBeInTheDocument();
  });

  it("shows the no-repo state", () => {
    renderPanel({
      scm: makeScm({ panelState: "no-repo", repo: null, status: null }),
    });
    expect(screen.getByText("No repository")).toBeInTheDocument();
  });

  it("shows the error state and retries", () => {
    const scm = makeScm({
      panelState: "error",
      status: null,
      statusError: "fatal: bad object",
    });
    renderPanel({ scm });
    expect(screen.getByText("Source control error")).toBeInTheDocument();
    expect(screen.getByText("fatal: bad object")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(scm.refresh).toHaveBeenCalled();
  });

  it("shows the clean tree hint when ready without changes", () => {
    renderPanel({ scm: makeScm() });
    expect(screen.getByText("Working tree clean")).toBeInTheDocument();
  });

  it("labels a detached head", () => {
    renderPanel({
      scm: makeScm({ status: status({ isDetached: true }) }),
    });
    expect(screen.getAllByText("detached").length).toBeGreaterThan(0);
  });
});

describe("changed file list", () => {
  it("renders the rows for changed files", () => {
    const entries = [fileEntry("a.ts"), fileEntry("b.ts")];
    renderPanel({
      scm: makeScm({
        allClean: false,
        fileEntries: entries,
        unstagedEntries: [],
        status: status(),
      }),
    });
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
  });

  it("shows the diverged banner when ahead and behind", () => {
    renderPanel({
      scm: makeScm({
        allClean: false,
        fileEntries: [fileEntry("a.ts")],
        status: status({ ahead: 1, behind: 2 }),
      }),
    });
    expect(screen.getByText("Diverged from upstream")).toBeInTheDocument();
  });
});

describe("commit composer wiring", () => {
  const stagedScm = (overrides: Partial<SourceControlPanelState> = {}) =>
    makeScm({
      allClean: false,
      commitMessage: "feat: change",
      stagedEntries: [
        {
          key: "+:a.ts",
          path: "a.ts",
          mode: "+",
          indexStatus: "M",
          worktreeStatus: " ",
          statusLabel: "Modified",
          statusCode: "M",
          originalPath: null,
          untracked: false,
        },
      ],
      fileEntries: [fileEntry("a.ts")],
      ...overrides,
    });

  it("commits via the keyboard shortcut when possible", () => {
    const scm = stagedScm();
    renderPanel({ scm });
    fireEvent.keyDown(screen.getByPlaceholderText("Commit message"), {
      key: "Enter",
      metaKey: true,
    });
    expect(scm.commit).toHaveBeenCalled();
  });

  it("ignores the commit shortcut without a message", () => {
    const scm = stagedScm({ commitMessage: "   " });
    renderPanel({ scm });
    fireEvent.keyDown(screen.getByPlaceholderText("Commit message"), {
      key: "Enter",
      metaKey: true,
    });
    expect(scm.commit).not.toHaveBeenCalled();
  });

  it("generates a message via the keyboard shortcut", () => {
    const scm = stagedScm();
    renderPanel({ scm });
    fireEvent.keyDown(screen.getByPlaceholderText("Commit message"), {
      key: "g",
      ctrlKey: true,
    });
    expect(scm.generateCommitMessage).toHaveBeenCalled();
  });

  it("ignores the generate shortcut when unavailable", () => {
    const scm = stagedScm({ canGenerateCommitMessage: false });
    renderPanel({ scm });
    fireEvent.keyDown(screen.getByPlaceholderText("Commit message"), {
      key: "g",
      metaKey: true,
    });
    expect(scm.generateCommitMessage).not.toHaveBeenCalled();
  });

  it("surfaces action errors in the footer", () => {
    renderPanel({
      scm: makeScm({
        allClean: false,
        fileEntries: [fileEntry("a.ts")],
        actionError: "index locked",
      }),
    });
    expect(screen.getByText("index locked")).toBeInTheDocument();
  });
});

describe("header actions", () => {
  it("refreshes from the header button", async () => {
    const scm = makeScm();
    renderPanel({ scm });
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh source control" }),
    );
    await waitFor(() => {
      expect(scm.refresh).toHaveBeenCalled();
    });
  });

  it("runs fetch and pull through the summary", () => {
    const summary = makeSummary({
      status: status({ behind: 1 }),
    });
    renderPanel({
      scm: makeScm({ status: status({ behind: 1 }) }),
      summary,
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch from remote" }));
    expect(summary.runRemoteAction).toHaveBeenCalledWith("fetch");
    fireEvent.click(
      screen.getByRole("button", { name: "Pull 1 commits (fast-forward)" }),
    );
    expect(summary.runRemoteAction).toHaveBeenCalledWith("pull");
  });
});

describe("commit graph entry point", () => {
  it("renders the button only with a handler and opens the graph", () => {
    const onOpenGitGraph = vi.fn();
    renderPanel({ scm: makeScm(), onOpenGitGraph });
    fireEvent.click(screen.getByText("Commit Graph"));
    expect(onOpenGitGraph).toHaveBeenCalled();
    cleanup();
    renderPanel({ scm: makeScm() });
    expect(screen.queryByText("Commit Graph")).toBeNull();
  });
});

describe("discard dialog wiring", () => {
  it("confirms a pending discard", () => {
    const scm = makeScm({
      pendingDiscard: { scope: "single", count: 1, label: "a.ts" },
    });
    renderPanel({ scm });
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(scm.confirmPendingDiscard).toHaveBeenCalled();
  });
});
