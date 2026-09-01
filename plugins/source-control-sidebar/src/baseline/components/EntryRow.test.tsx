// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { TooltipProvider } from "@termco/ui";
import {
  copyToClipboard,
  revealInFinder,
} from "../lib/featureHelpers";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SourceControlFileEntry } from "../useSourceControlPanel";
import { EntryRow } from "./EntryRow";
import type { RowRendererProps } from "./types";

vi.mock("../lib/featureHelpers", () => ({
  copyToClipboard: vi.fn(async () => {}),
  revealInFinder: vi.fn(async () => {}),
  COMPACT_CONTENT: "",
  COMPACT_ITEM: "",
  joinPath: (a: string, b: string) => `${a}/${b}`,
}));
vi.mock("../../runtime", () => ({
  fileIconUrl: vi.fn(() => "icon://ts.svg"),
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

function entry(
  overrides: Partial<SourceControlFileEntry> = {},
): SourceControlFileEntry {
  return {
    key: "src/a.ts",
    path: "src/a.ts",
    originalPath: null,
    statusCode: "M",
    statusLabel: "Modified",
    checkState: "unchecked",
    staged: false,
    unstaged: true,
    untracked: false,
    ...overrides,
  };
}

type Handlers = Pick<
  RowRendererProps,
  | "onFocusRow"
  | "onToggleAll"
  | "onSelectFile"
  | "onToggleStageFile"
  | "onDiscardFile"
  | "onOpenFile"
>;

function renderRow(
  fileEntry: SourceControlFileEntry,
  overrides: Partial<RowRendererProps> = {},
): Handlers {
  const handlers: Handlers = {
    onFocusRow: vi.fn(),
    onToggleAll: vi.fn(),
    onSelectFile: vi.fn(async () => {}),
    onToggleStageFile: vi.fn(async () => {}),
    onDiscardFile: vi.fn(),
    onOpenFile: vi.fn(),
  };
  const row = { kind: "entry", key: fileEntry.key, entry: fileEntry } as const;
  render(
    <TooltipProvider>
      <EntryRow
        focused={false}
        selectedPath={null}
        actionBusy={null}
        headerCheckState="unchecked"
        repoRoot="/repo"
        {...handlers}
        {...overrides}
        row={row}
      />
    </TooltipProvider>,
  );
  return handlers;
}

describe("EntryRow", () => {
  it("shows the file name with its directory label", () => {
    renderRow(entry());
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
  });

  it("labels renames with the original path", () => {
    renderRow(
      entry({
        path: "src/new.ts",
        originalPath: "src/old.ts",
        statusCode: "R",
      }),
    );
    expect(screen.getByText("src/old.ts → src/new.ts")).toBeInTheDocument();
  });

  it("focuses and opens the diff when the row is clicked", () => {
    const handlers = renderRow(entry());
    fireEvent.click(screen.getByText("a.ts"));
    expect(handlers.onFocusRow).toHaveBeenCalledWith("src/a.ts");
    expect(handlers.onSelectFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "src/a.ts" }),
    );
  });

  it("toggles staging from the checkbox", () => {
    const handlers = renderRow(entry());
    fireEvent.click(screen.getByRole("checkbox", { name: "Stage src/a.ts" }));
    expect(handlers.onToggleStageFile).toHaveBeenCalled();
  });

  it("shows the discard button only for unstaged entries", () => {
    const handlers = renderRow(entry());
    fireEvent.click(screen.getByRole("button", { name: "Discard src/a.ts" }));
    expect(handlers.onDiscardFile).toHaveBeenCalled();

    cleanup();
    renderRow(entry({ staged: true, unstaged: false, checkState: "checked" }));
    expect(
      screen.queryByRole("button", { name: "Discard src/a.ts" }),
    ).toBeNull();
  });

  it("disables actions and shows a spinner while its stage action runs", () => {
    renderRow(entry(), { actionBusy: "stage:src/a.ts" });
    expect(
      screen.queryByRole("checkbox", { name: "Stage src/a.ts" }),
    ).toBeNull();
  });

  it("disables the checkbox while any action is busy", () => {
    renderRow(entry(), { actionBusy: "commit" });
    expect(
      screen.getByRole("checkbox", { name: "Stage src/a.ts" }),
    ).toBeDisabled();
  });

  it("marks the selected row", () => {
    renderRow(entry(), { selectedPath: "src/a.ts" });
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });

  describe("context menu", () => {
    function openMenu(
      fileEntry: SourceControlFileEntry,
      overrides: Partial<RowRendererProps> = {},
    ) {
      const handlers = renderRow(fileEntry, overrides);
      fireEvent.contextMenu(screen.getByRole("option"));
      return handlers;
    }

    it("opens the diff", () => {
      const handlers = openMenu(entry());
      fireEvent.click(screen.getByText("Open Diff"));
      expect(handlers.onSelectFile).toHaveBeenCalled();
    });

    it("opens the file with its absolute path", () => {
      const handlers = openMenu(entry());
      fireEvent.click(screen.getByText("Open File"));
      expect(handlers.onOpenFile).toHaveBeenCalledWith("/repo/src/a.ts");
    });

    it("hides Open File and Reveal for deleted files", () => {
      openMenu(entry({ statusCode: "D", statusLabel: "Deleted" }));
      expect(screen.queryByText("Open File")).toBeNull();
      expect(screen.queryByText("Reveal in Finder")).toBeNull();
    });

    it("offers Stage for unchecked and Unstage for checked entries", () => {
      const handlers = openMenu(entry());
      fireEvent.click(screen.getByText("Stage"));
      expect(handlers.onToggleStageFile).toHaveBeenCalled();

      cleanup();
      openMenu(entry({ staged: true, unstaged: false, checkState: "checked" }));
      expect(screen.getByText("Unstage")).toBeInTheDocument();
      expect(screen.queryByText("Discard Changes")).toBeNull();
    });

    it("discards changes for unstaged entries", () => {
      const handlers = openMenu(entry());
      fireEvent.click(screen.getByText("Discard Changes"));
      expect(handlers.onDiscardFile).toHaveBeenCalled();
    });

    it("copies the relative path with forward slashes", () => {
      openMenu(entry({ path: "src\\win\\a.ts", key: "src\\win\\a.ts" }));
      fireEvent.click(screen.getByText("Copy Relative Path"));
      expect(copyToClipboard).toHaveBeenCalledWith("src/win/a.ts");
    });

    it("copies the absolute path", () => {
      openMenu(entry());
      fireEvent.click(screen.getByText("Copy Absolute Path"));
      expect(copyToClipboard).toHaveBeenCalledWith("/repo/src/a.ts");
    });

    it("reveals the file in the finder", () => {
      openMenu(entry());
      fireEvent.click(screen.getByText(/Reveal in (Finder|File Manager)/));
      expect(revealInFinder).toHaveBeenCalledWith("/repo/src/a.ts");
    });

    it("omits absolute-path actions without a repo root", () => {
      openMenu(entry(), { repoRoot: null });
      expect(screen.queryByText("Copy Absolute Path")).toBeNull();
      expect(screen.queryByText("Open File")).toBeNull();
      expect(screen.queryByText("Reveal in Finder")).toBeNull();
    });
  });
});
