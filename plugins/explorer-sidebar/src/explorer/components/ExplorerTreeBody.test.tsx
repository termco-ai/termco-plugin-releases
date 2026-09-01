// @vitest-environment jsdom
import type { Virtualizer } from "@tanstack/react-virtual";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/buildRows";
import type { RowActions } from "./EntryRow";
import { ExplorerTreeBody } from "./ExplorerTreeBody";

afterEach(cleanup);

function fakeVirtualizer(count: number) {
  return {
    getTotalSize: () => count * 24,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        size: 24,
        start: index * 24,
      })),
  } as unknown as Virtualizer<HTMLDivElement, Element>;
}

function entryRow(path: string, isDir = false): Row {
  return {
    kind: "entry",
    key: path,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    isDir,
    isExpanded: false,
    depth: 0,
    gitignored: false,
    gitStatusCode: null,
  };
}

const rowActions: RowActions = {
  toggle: vi.fn(),
  beginRename: vi.fn(),
  commitRename: vi.fn(),
  cancelRename: vi.fn(),
};

type Props = Parameters<typeof ExplorerTreeBody>[0];

function setup(overrides: Partial<Props> = {}) {
  const rows = overrides.rows ?? [entryRow("/ws/a.ts")];
  const props: Props = {
    root: { status: "loaded", entries: [] },
    pendingAtRoot: null,
    virtualizer: fakeVirtualizer(rows.length),
    rows,
    rowActions,
    renameInProgress: false,
    selectedPath: null,
    dropTargetDir: null,
    gitDecorations: true,
    onOpenFile: vi.fn(),
    onSelectPath: vi.fn(),
    onCommitCreate: vi.fn(),
    onCancelCreate: vi.fn(),
    ...overrides,
  };
  render(<ExplorerTreeBody {...props} />);
  return props;
}

describe("ExplorerTreeBody", () => {
  it("shows the root loading state", () => {
    setup({ root: { status: "loading" }, rows: [] });
    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("shows the root error state", () => {
    setup({ root: { status: "error", message: "boom" }, rows: [] });
    expect(screen.getByText("boom")).toBeDefined();
  });

  it("renders nothing for an idle root", () => {
    setup({ root: { status: "idle" }, rows: [] });
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("renders entry rows through the virtualizer", () => {
    const props = setup({
      rows: [entryRow("/ws/a.ts"), entryRow("/ws/src", true)],
    });
    expect(screen.getByText("a.ts")).toBeDefined();
    expect(screen.getByText("src")).toBeDefined();
    fireEvent.click(screen.getByText("a.ts"));
    expect(props.onOpenFile).toHaveBeenCalledWith("/ws/a.ts");
  });

  it("renders a rename row as an inline input", () => {
    setup({
      rows: [
        {
          kind: "rename",
          key: "rename:/ws/a.ts",
          path: "/ws/a.ts",
          name: "a.ts",
          isDir: false,
          depth: 0,
          gitignored: false,
          gitStatusCode: null,
        },
      ],
    });
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("a.ts");
  });

  it("renders pending and status rows", () => {
    const props = setup({
      rows: [
        {
          kind: "pending",
          key: "pending:/ws/src",
          depth: 1,
          pendingKind: "file",
        },
        {
          kind: "status",
          key: "loading:/ws/src",
          depth: 1,
          tone: "muted",
          message: "Loading…",
        },
      ],
    });
    const input = screen.getByPlaceholderText("New file");
    expect(screen.getByText("Loading…")).toBeDefined();
    fireEvent.change(input, { target: { value: "x.ts" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onCommitCreate).toHaveBeenCalledWith("x.ts");
  });

  it("renders the root-level pending row above the list", () => {
    const props = setup({
      pendingAtRoot: { parentPath: "/ws", kind: "dir" },
      rows: [],
    });
    const input = screen.getByPlaceholderText("New folder");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onCancelCreate).toHaveBeenCalled();
  });

  it("skips virtual items with no backing row", () => {
    setup({ rows: [], virtualizer: fakeVirtualizer(2) });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
