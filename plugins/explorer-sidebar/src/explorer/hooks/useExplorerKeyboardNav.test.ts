// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../lib/buildRows";
import { useExplorerKeyboardNav } from "./useExplorerKeyboardNav";

function entryRow(path: string, isDir: boolean, isExpanded = false): Row {
  return {
    kind: "entry",
    key: path,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    isDir,
    isExpanded,
    depth: 0,
    gitignored: false,
    gitStatusCode: null,
  };
}

function setup(
  overrides: Partial<
    Parameters<typeof useExplorerKeyboardNav>[0] & { rows: Row[] }
  > = {},
) {
  const rows = overrides.rows ?? [
    entryRow("/ws/dir", true),
    entryRow("/ws/a.ts", false),
    entryRow("/ws/b.ts", false),
  ];
  const entryIndexByPath = new Map(rows.map((r, i) => [r.key, i]));
  const handlers = {
    setSelectedPath: vi.fn<(path: string) => void>(),
    scrollEntryIntoView: vi.fn<(path: string) => void>(),
    toggle: vi.fn<(path: string) => void>(),
    onOpenFile: vi.fn<(path: string, pin?: boolean) => void>(),
  };
  const { result } = renderHook(() =>
    useExplorerKeyboardNav({
      rows,
      entryIndexByPath,
      entryPaths: rows.map((r) => r.key),
      selectedPath: null,
      rootPath: "/ws",
      renaming: null,
      pendingCreate: null,
      isSearchOpen: false,
      ...handlers,
      ...overrides,
    }),
  );
  return { handler: result.current, handlers };
}

function key(
  keyName: string,
  target: Partial<HTMLElement> = { tagName: "DIV" },
): KeyboardEvent<HTMLDivElement> {
  return {
    key: keyName,
    target,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

describe("useExplorerKeyboardNav", () => {
  it("ignores input while renaming, creating, or searching", () => {
    for (const overrides of [
      { renaming: "/ws/a.ts" },
      { pendingCreate: { parentPath: "/ws", kind: "file" as const } },
      { isSearchOpen: true },
    ]) {
      const { handler, handlers } = setup(overrides);
      handler(key("ArrowDown"));
      expect(handlers.setSelectedPath).not.toHaveBeenCalled();
    }
  });

  it("ignores keys originating from form fields", () => {
    const { handler, handlers } = setup();
    handler(key("ArrowDown", { tagName: "INPUT" }));
    handler(key("ArrowDown", { tagName: "TEXTAREA" }));
    handler(key("ArrowDown", { tagName: "DIV", isContentEditable: true }));
    expect(handlers.setSelectedPath).not.toHaveBeenCalled();
  });

  it("does nothing when the tree is empty", () => {
    const { handler, handlers } = setup({ rows: [] });
    handler(key("ArrowDown"));
    expect(handlers.setSelectedPath).not.toHaveBeenCalled();
  });

  it("ArrowDown selects the first entry when nothing is selected", () => {
    const { handler, handlers } = setup();
    handler(key("ArrowDown"));
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/dir");
    expect(handlers.scrollEntryIntoView).toHaveBeenCalledWith("/ws/dir");
  });

  it("ArrowDown moves to the next entry and clamps at the end", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/b.ts" });
    handler(key("ArrowDown"));
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/b.ts");
  });

  it("ArrowUp selects the last entry when nothing is selected", () => {
    const { handler, handlers } = setup();
    handler(key("ArrowUp"));
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/b.ts");
  });

  it("ArrowUp moves up and clamps at the start", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/dir" });
    handler(key("ArrowUp"));
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/dir");
  });

  it("ArrowRight expands a collapsed directory", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/dir" });
    handler(key("ArrowRight"));
    expect(handlers.toggle).toHaveBeenCalledWith("/ws/dir");
  });

  it("ArrowRight on an expanded directory moves into it", () => {
    const rows = [entryRow("/ws/dir", true, true), entryRow("/ws/a.ts", false)];
    const { handler, handlers } = setup({ rows, selectedPath: "/ws/dir" });
    handler(key("ArrowRight"));
    expect(handlers.toggle).not.toHaveBeenCalled();
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/a.ts");
  });

  it("ArrowRight without a selection is a no-op", () => {
    const { handler, handlers } = setup();
    handler(key("ArrowRight"));
    expect(handlers.toggle).not.toHaveBeenCalled();
    expect(handlers.setSelectedPath).not.toHaveBeenCalled();
  });

  it("ArrowLeft collapses an expanded directory", () => {
    const rows = [entryRow("/ws/dir", true, true)];
    const { handler, handlers } = setup({ rows, selectedPath: "/ws/dir" });
    handler(key("ArrowLeft"));
    expect(handlers.toggle).toHaveBeenCalledWith("/ws/dir");
  });

  it("ArrowLeft on a file selects its parent directory", () => {
    const rows = [
      entryRow("/ws/dir", true, true),
      entryRow("/ws/dir/a.ts", false),
    ];
    const { handler, handlers } = setup({
      rows,
      selectedPath: "/ws/dir/a.ts",
    });
    handler(key("ArrowLeft"));
    expect(handlers.setSelectedPath).toHaveBeenCalledWith("/ws/dir");
  });

  it("ArrowLeft on a top-level file does not jump to the root", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/a.ts" });
    handler(key("ArrowLeft"));
    expect(handlers.setSelectedPath).not.toHaveBeenCalled();
  });

  it("Enter toggles a directory", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/dir" });
    handler(key("Enter"));
    expect(handlers.toggle).toHaveBeenCalledWith("/ws/dir");
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
  });

  it("Enter opens a file", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/a.ts" });
    handler(key("Enter"));
    expect(handlers.onOpenFile).toHaveBeenCalledWith("/ws/a.ts");
  });

  it("ignores unrelated keys", () => {
    const { handler, handlers } = setup({ selectedPath: "/ws/a.ts" });
    handler(key("x"));
    expect(handlers.setSelectedPath).not.toHaveBeenCalled();
    expect(handlers.onOpenFile).not.toHaveBeenCalled();
  });
});
