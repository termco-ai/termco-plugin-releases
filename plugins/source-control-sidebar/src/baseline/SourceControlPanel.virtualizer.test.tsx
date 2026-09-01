// @vitest-environment jsdom

// Unlike SourceControlPanel.test.tsx this suite keeps the real TanStack
// virtualizer: it guards against React Compiler memoization replaying an empty
// getVirtualItems() result after the initial measurement rerender.

import type { GitStatusSnapshot } from "@termco/git-base";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

const useSourceControlPanelMock = vi.fn();
vi.mock("./useSourceControlPanel", () => ({
  useSourceControlPanel: (...args: unknown[]) =>
    useSourceControlPanelMock(...args),
}));

import { SourceControlPanel } from "./SourceControlPanel";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetHeight",
);
const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetWidth",
);

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  // Give the virtualizer a viewport; jsdom reports 0x0 otherwise.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 300,
  });
});

afterAll(() => {
  if (originalOffsetHeight) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetHeight",
      originalOffsetHeight,
    );
  }
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetWidth",
      originalOffsetWidth,
    );
  }
  vi.unstubAllGlobals();
});

function status(): GitStatusSnapshot {
  return {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
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

function makeSummary(): SourceControlSummary {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("SourceControlPanel with a real virtualizer", () => {
  it("renders changed-file rows after initial measurement", async () => {
    useSourceControlPanelMock.mockReturnValue(
      makeScm({
        allClean: false,
        fileEntries: [fileEntry("a.ts"), fileEntry("b.ts")],
      }),
    );
    render(
      <SourceControlPanel
        open
        sourceControl={makeSummary()}
        onOpenDiff={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("a.ts")).toBeTruthy();
    });
    expect(screen.getByText("b.ts")).toBeTruthy();
  });
});
