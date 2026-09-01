// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { TooltipProvider } from "@termco/ui";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SourceControlFileEntry } from "../useSourceControlPanel";
import { RowRenderer } from "./RowRenderer";
import type { RowDescriptor, RowRendererProps } from "./types";

vi.mock("../lib/featureHelpers", () => ({
  copyToClipboard: vi.fn(async () => {}),
  revealInFinder: vi.fn(async () => {}),
  COMPACT_CONTENT: "",
  COMPACT_ITEM: "",
  joinPath: (a: string, b: string) => `${a}/${b}`,
}));
vi.mock("../../runtime", () => ({
  fileIconUrl: vi.fn(() => null),
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

const entry: SourceControlFileEntry = {
  key: "a.ts",
  path: "a.ts",
  originalPath: null,
  statusCode: "M",
  statusLabel: "Modified",
  checkState: "unchecked",
  staged: false,
  unstaged: true,
  untracked: false,
};

function renderRow(row: RowDescriptor) {
  const props: RowRendererProps = {
    row,
    focused: false,
    selectedPath: null,
    actionBusy: null,
    headerCheckState: "unchecked",
    repoRoot: "/repo",
    onFocusRow: vi.fn(),
    onToggleAll: vi.fn(),
    onSelectFile: vi.fn(async () => {}),
    onToggleStageFile: vi.fn(async () => {}),
    onDiscardFile: vi.fn(),
  };
  render(
    <TooltipProvider>
      <RowRenderer {...props} />
    </TooltipProvider>,
  );
}

describe("RowRenderer", () => {
  it("renders the diverged banner", () => {
    renderRow({ kind: "banner-diverged", key: "banner-diverged" });
    expect(screen.getByText("Diverged from upstream")).toBeInTheDocument();
  });

  it("renders the list header", () => {
    renderRow({ kind: "list-header", key: "list-header", count: 5 });
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders an entry row", () => {
    renderRow({ kind: "entry", key: entry.key, entry });
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByRole("option")).toBeInTheDocument();
  });
});
