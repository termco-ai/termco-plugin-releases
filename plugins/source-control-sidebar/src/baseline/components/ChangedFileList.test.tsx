// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { Virtualizer } from "@tanstack/react-virtual";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangedFileList } from "./ChangedFileList";
import type { RowDescriptor } from "./types";

vi.mock("./RowRenderer", () => ({
  RowRenderer: ({ row, focused }: { row: RowDescriptor; focused: boolean }) => (
    <div data-testid={`row-${row.key}`} data-focused={focused} />
  ),
}));

afterEach(cleanup);

const rows: RowDescriptor[] = [
  { kind: "list-header", key: "list-header", count: 2 },
  {
    kind: "entry",
    key: "a.ts",
    entry: {
      key: "a.ts",
      path: "a.ts",
      originalPath: null,
      statusCode: "M",
      statusLabel: "Modified",
      checkState: "unchecked",
      staged: false,
      unstaged: true,
      untracked: false,
    },
  },
];

function fakeVirtualizer(count: number) {
  return {
    getTotalSize: () => count * 30,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 30,
        start: index * 30,
      })),
  } as unknown as Virtualizer<HTMLDivElement, Element>;
}

type Props = ComponentProps<typeof ChangedFileList>;

function renderList(overrides: Partial<Props> = {}) {
  const props: Props = {
    containerRef: { current: null },
    scrollRef: { current: null },
    focusedRowKey: null,
    setFocusedRowKey: vi.fn(),
    onKeyDown: vi.fn(),
    virtualizer: fakeVirtualizer(rows.length),
    rows,
    selectedPath: null,
    actionBusy: null,
    headerCheckState: "unchecked",
    repoRoot: "/repo",
    onToggleAll: vi.fn(),
    onSelectFile: vi.fn(async () => {}),
    onToggleStageFile: vi.fn(async () => {}),
    onDiscardFile: vi.fn(),
    ...overrides,
  };
  render(<ChangedFileList {...props} />);
  return props;
}

describe("ChangedFileList", () => {
  it("renders every virtual row", () => {
    renderList();
    expect(screen.getByTestId("row-list-header")).toBeInTheDocument();
    expect(screen.getByTestId("row-a.ts")).toBeInTheDocument();
  });

  it("skips virtual items without a backing row", () => {
    renderList({ virtualizer: fakeVirtualizer(rows.length + 2) });
    expect(screen.getAllByTestId(/^row-/)).toHaveLength(rows.length);
  });

  it("marks the focused row", () => {
    renderList({ focusedRowKey: "a.ts" });
    expect(screen.getByTestId("row-a.ts")).toHaveAttribute(
      "data-focused",
      "true",
    );
    expect(screen.getByTestId("row-list-header")).toHaveAttribute(
      "data-focused",
      "false",
    );
  });

  it("exposes listbox semantics with the active descendant", () => {
    renderList({ focusedRowKey: "a.ts" });
    const listbox = screen.getByRole("listbox", { name: "Changed files" });
    expect(listbox).toHaveAttribute("aria-activedescendant", "scm-row-a.ts");
  });

  it("omits the active descendant without focus", () => {
    renderList();
    expect(
      screen.getByRole("listbox", { name: "Changed files" }),
    ).not.toHaveAttribute("aria-activedescendant");
  });

  it("forwards keyboard events", () => {
    const props = renderList();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "ArrowDown" });
    expect(props.onKeyDown).toHaveBeenCalled();
  });
});
