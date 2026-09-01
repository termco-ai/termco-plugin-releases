// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../runtime", () => ({ useShortcutLabel: () => "Ctrl+F" }));

import { createHeaderRuntime } from "../../testRuntime";
import type { SearchInlineHandle, SearchTarget } from "../types";
import { SearchInline } from "./SearchInline";

afterEach(cleanup);

function terminalTarget() {
  const addon = {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clear: vi.fn(),
  };
  const focus = vi.fn();
  const target = {
    kind: "terminal",
    ...addon,
    focus,
  } as unknown as NonNullable<SearchTarget>;
  return { addon, focus, target };
}

function editorTarget() {
  const handle = {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clear: vi.fn(),
  };
  const focus = vi.fn();
  const target = {
    kind: "editor",
    findNext: handle.findNext,
    findPrevious: handle.findPrevious,
    clear: handle.clear,
    focus,
  } as unknown as NonNullable<SearchTarget>;
  return { handle, focus, target };
}

/**
 * Renders the bar and, by default, puts it into find mode — the bar now rests
 * as the palette launcher, so find has to be invoked (as ⌘F does) first.
 * Pass `{ rest: true }` to assert the resting launcher itself.
 */
function setup(
  target: SearchTarget,
  compact?: boolean,
  opts?: { rest?: boolean },
) {
  const ref = createRef<SearchInlineHandle>();
  const paletteShow = vi.fn();
  const runtime = createHeaderRuntime({
    palette: {
      open: false,
      show: paletteShow,
      close: vi.fn(),
      setAnchor: vi.fn(),
      setInputSlot: vi.fn(),
    },
  });
  const view = render(
    <SearchInline ref={ref} target={target} runtime={runtime} compact={compact} />,
  );
  if (!opts?.rest && !compact) act(() => ref.current?.focus());
  return { ref, paletteShow, runtime, ...view };
}

function input(): HTMLInputElement {
  // Non-mac fallback: search.focus renders as Ctrl+F.
  return screen.getByPlaceholderText("Search (Ctrl+F)") as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SearchInline", () => {
  it("renders the find input with the shortcut placeholder once invoked", () => {
    setup(terminalTarget().target);
    expect(input()).toBeDefined();
  });

  it("rests as the palette bar, hosting the palette's input slot", () => {
    setup(terminalTarget().target, false, { rest: true });
    expect(screen.queryByPlaceholderText("Search (Ctrl+F)")).toBeNull();
    // The bar renders the chrome; the palette portals its field into it.
    expect(screen.getByTestId("palette-bar")).toBeDefined();
  });

  it("hands the bar back to the palette on Escape", () => {
    setup(terminalTarget().target);
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search (Ctrl+F)")).toBeNull();
    expect(screen.getByTestId("palette-bar")).toBeDefined();
  });

  it("uses the git-search label for git-history targets", () => {
    const target = {
      kind: "git-history",
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clear: vi.fn(),
      focus: vi.fn(),
    } as unknown as NonNullable<SearchTarget>;
    setup(target);
    expect(screen.getByPlaceholderText("Git search (Ctrl+F)")).toBeDefined();
  });

  it("runs incremental terminal search while typing", () => {
    const { addon, target } = terminalTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "err" } });
    expect(addon.findNext).toHaveBeenCalledWith(
      "err",
      expect.objectContaining({ incremental: true }),
    );
  });

  it("clears terminal decorations when the query empties", () => {
    const { addon, target } = terminalTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "err" } });
    fireEvent.change(input(), { target: { value: "" } });
    expect(addon.clear).toHaveBeenCalled();
  });

  it("drives the editor query for editor targets", () => {
    const { handle, target } = editorTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "todo" } });
    expect(handle.findNext).toHaveBeenCalledWith(
      "todo",
      expect.objectContaining({ incremental: true }),
    );
  });

  it("Enter finds forward, Shift+Enter finds backward (terminal)", () => {
    const { addon, target } = terminalTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "err" } });
    addon.findNext.mockClear();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(addon.findNext).toHaveBeenCalledWith("err", expect.anything());
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    expect(addon.findPrevious).toHaveBeenCalledWith("err", expect.anything());
  });

  it("Enter navigates editor matches", () => {
    const { handle, target } = editorTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "todo" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(handle.findNext).toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    expect(handle.findPrevious).toHaveBeenCalled();
  });

  it("Escape clears the search and restores target focus", () => {
    const { addon, focus, target } = terminalTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "err" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(addon.clear).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    // Leaving find drops the query with the field.
    expect(screen.queryByPlaceholderText("Search (Ctrl+F)")).toBeNull();
  });

  it("the clear button resets the query and keeps input focus", () => {
    const { addon, target } = terminalTarget();
    setup(target);
    fireEvent.change(input(), { target: { value: "err" } });
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(input().value).toBe("");
    expect(addon.clear).toHaveBeenCalled();
    expect(document.activeElement).toBe(input());
  });

  it("collapses to a command launcher in compact mode", () => {
    setup(terminalTarget().target, true, { rest: true });
    expect(screen.queryByPlaceholderText("Search (Ctrl+F)")).toBeNull();
    expect(screen.getByTitle(/Search or run a command/)).toBeDefined();
  });

  it("opens the command palette from the compact launcher", () => {
    const { paletteShow } = setup(terminalTarget().target, true, { rest: true });
    fireEvent.click(screen.getByTitle(/Search or run a command/));
    expect(paletteShow).toHaveBeenCalledOnce();
  });

  it("collapses again when compact find is blurred while empty", () => {
    const { ref } = setup(terminalTarget().target, true, { rest: true });
    act(() => ref.current?.focus());
    fireEvent.blur(input());
    expect(screen.queryByPlaceholderText("Search (Ctrl+F)")).toBeNull();
  });

  it("keeps compact find expanded on blur when a query is present", () => {
    const { ref } = setup(terminalTarget().target, true, { rest: true });
    act(() => ref.current?.focus());
    fireEvent.change(input(), { target: { value: "err" } });
    fireEvent.blur(input());
    expect(input()).toBeDefined();
  });

  it("focuses through the imperative handle", () => {
    const { ref } = setup(terminalTarget().target);
    ref.current?.focus();
    expect(document.activeElement).toBe(input());
  });

  it("clears highlights when the target goes away", () => {
    const { addon, target } = terminalTarget();
    const ref = createRef<SearchInlineHandle>();
    const runtime = createHeaderRuntime();
    const { rerender } = render(
      <SearchInline ref={ref} target={target} runtime={runtime} />,
    );
    rerender(<SearchInline ref={ref} target={null} runtime={runtime} />);
    expect(addon.clear).toHaveBeenCalled();
  });
});
