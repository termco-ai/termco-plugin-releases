// @vitest-environment jsdom
import type { GitCommitFileChange, GitLogEntry } from "../../runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { PAGE_SIZE } from "./lib/constants";

const mocks = vi.hoisted(() => ({
  gitLog: vi.fn(),
  gitCommitFiles: vi.fn(),
  gitRemoteUrl: vi.fn(),
}));

vi.mock("../../runtime", () => ({
  native: {
    gitLog: mocks.gitLog,
    gitCommitFiles: mocks.gitCommitFiles,
    gitRemoteUrl: mocks.gitRemoteUrl,
  },
  fileIconUrl: () => "",
  writeClipboardText: vi.fn(async () => {}),
}));

import { GitHistoryPane } from "./GitHistoryPane";

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
    get: () => 900,
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
    subject: `Change ${sha}`,
    filesChanged: 1,
    insertions: 1,
    deletions: 0,
    ...overrides,
  };
}

function page(prefix: string, count: number): GitLogEntry[] {
  return Array.from({ length: count }, (_, i) =>
    commit(`${prefix}${String(i).padStart(3, "0")}`),
  );
}

// The pane's viewport never scrolls in jsdom, so after a full first page the
// auto-fill effect pulls a second page; the short second page ends the history.
function queueTwoPages() {
  mocks.gitLog
    .mockResolvedValueOnce(page("c", PAGE_SIZE))
    .mockResolvedValueOnce([commit("zzz999")]);
}

// A short page ends the history immediately, so no auto-fill follow-up fires.
function queueSinglePage(count = 3) {
  mocks.gitLog.mockResolvedValueOnce(page("c", count));
}

function file(path: string): GitCommitFileChange {
  return {
    path,
    originalPath: null,
    status: "M",
    statusLabel: "Modified",
    added: 2,
    removed: 1,
    isBinary: false,
  };
}

function renderPane() {
  const onOpenCommitFile = vi.fn();
  const view = render(
    <GitHistoryPane repoRoot="/repo" onOpenCommitFile={onOpenCommitFile} />,
  );
  return { onOpenCommitFile, ...view };
}

beforeEach(() => {
  mocks.gitLog.mockReset();
  mocks.gitCommitFiles.mockReset();
  mocks.gitRemoteUrl.mockReset();
  mocks.gitRemoteUrl.mockResolvedValue(null);
  mocks.gitCommitFiles.mockResolvedValue([file("src/a.ts")]);
});

afterEach(() => {
  cleanup();
});

describe("GitHistoryPane states", () => {
  it("shows the loading placeholder while the first page is in flight", () => {
    mocks.gitLog.mockReturnValue(new Promise(() => {}));
    renderPane();
    expect(screen.getByText("Loading commits…")).toBeTruthy();
  });

  it("shows the error placeholder and retries", async () => {
    mocks.gitLog.mockRejectedValueOnce(new Error("fatal: not a git repo"));
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Could not load history")).toBeTruthy();
    });
    expect(screen.getByText("fatal: not a git repo")).toBeTruthy();

    queueSinglePage();
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
  });

  it("shows the empty placeholder for a repo without commits", async () => {
    mocks.gitLog.mockResolvedValue([]);
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("No commits yet")).toBeTruthy();
    });
  });

  it("renders rows from a single short page after initial measurement", async () => {
    queueSinglePage();
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    expect(screen.getByText("Change c002")).toBeTruthy();
    expect(mocks.gitLog).toHaveBeenCalledTimes(1);
    expect(screen.getByText("End of history")).toBeTruthy();
  });

  it("renders commit rows, the header, and the end marker", async () => {
    queueTwoPages();
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    expect(screen.getByText("Change c001")).toBeTruthy();
    expect(screen.getByText("SHA")).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(mocks.gitLog).toHaveBeenCalledWith("/repo", { limit: PAGE_SIZE });
    await waitFor(() => {
      expect(mocks.gitLog).toHaveBeenCalledWith("/repo", {
        limit: PAGE_SIZE,
        beforeSha: `c${String(PAGE_SIZE - 1).padStart(3, "0")}`,
      });
    });
    // The short second page ends the history.
    await waitFor(() => {
      expect(screen.getByText("End of history")).toBeTruthy();
    });
  });
});

describe("GitHistoryPane commit detail popover", () => {
  it("opens on row click, loads files, and links the remote", async () => {
    queueSinglePage();
    mocks.gitRemoteUrl.mockResolvedValue("git@github.com:owner/repo.git");
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Change c000"));
    await waitFor(() => {
      expect(screen.getByText("Copy SHA")).toBeTruthy();
    });
    expect(mocks.gitCommitFiles).toHaveBeenCalledWith("/repo", "c000");
    await waitFor(() => {
      expect(screen.getByText("a.ts")).toBeTruthy();
    });
    expect(screen.getByText("View on GitHub")).toBeTruthy();
  });

  it("toggles the popover closed when the same row is clicked again", async () => {
    queueSinglePage();
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    const row = screen.getByText("Change c000");
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByText("Copy SHA")).toBeTruthy();
    });
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.queryByText("Copy SHA")).toBeNull();
    });
  });

  it("opens a file diff and closes the popover", async () => {
    queueSinglePage();
    const { onOpenCommitFile } = renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Change c000"));
    await waitFor(() => {
      expect(screen.getByText("a.ts")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("a.ts"));
    expect(onOpenCommitFile).toHaveBeenCalledWith({
      repoRoot: "/repo",
      sha: "c000",
      shortSha: "c000",
      subject: "Change c000",
      path: "src/a.ts",
      originalPath: null,
    });
    await waitFor(() => {
      expect(screen.queryByText("Copy SHA")).toBeNull();
    });
  });

  it("hides the remote action when the remote is unsupported", async () => {
    queueSinglePage();
    mocks.gitRemoteUrl.mockResolvedValue("https://example.com/o/r.git");
    renderPane();
    await waitFor(() => {
      expect(screen.getByText("Change c000")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Change c000"));
    await waitFor(() => {
      expect(screen.getByText("Copy SHA")).toBeTruthy();
    });
    expect(screen.queryByText(/View on/)).toBeNull();
  });
});
