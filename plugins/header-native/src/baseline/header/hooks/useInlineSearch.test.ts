// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ shortcutLabel: "Ctrl+F" }));
vi.mock("../../runtime", () => ({
  useShortcutLabel: () => mocks.shortcutLabel,
}));

import { createHeaderRuntime } from "../../testRuntime";
import type { SearchTarget } from "../types";
import { useInlineSearch } from "./useInlineSearch";

const runtime = createHeaderRuntime();

afterEach(() => {
  cleanup();
  mocks.shortcutLabel = "Ctrl+F";
});

function terminalParts() {
  const addon = {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clear: vi.fn(),
  };
  const target = {
    kind: "terminal",
    ...addon,
    focus: vi.fn(),
  } as unknown as NonNullable<SearchTarget>;
  return { addon, target };
}

function terminalTarget() {
  return terminalParts().target;
}

describe("useInlineSearch", () => {
  it("derives the placeholder from the search shortcut", () => {
    const { result } = renderHook(() =>
      useInlineSearch(terminalTarget(), null, runtime),
    );
    expect(result.current.placeholder).toBe("Search (Ctrl+F)");
    expect(result.current.tooltipTitle).toBe("Search (Ctrl+F)");
  });

  it("honors a user override in the placeholder", () => {
    mocks.shortcutLabel = "Alt+S";
    const { result } = renderHook(() =>
      useInlineSearch(terminalTarget(), null, runtime),
    );
    expect(result.current.placeholder).toBe("Search (Alt+S)");
  });

  it("drops the hint when the shortcut is unbound", () => {
    mocks.shortcutLabel = "";
    const { result } = renderHook(() =>
      useInlineSearch(terminalTarget(), null, runtime),
    );
    expect(result.current.placeholder).toBe("Search");
  });

  it("rests as the launcher until find is invoked", () => {
    const { result } = renderHook(() =>
      useInlineSearch(terminalTarget(), null, runtime),
    );
    expect(result.current.expanded).toBe(false);
    act(() => result.current.focus());
    expect(result.current.expanded).toBe(true);
  });

  it("starts collapsed in compact mode until focused", () => {
    const { result } = renderHook(() =>
      useInlineSearch(terminalTarget(), null, runtime),
    );
    expect(result.current.expanded).toBe(false);
    act(() => result.current.focus());
    expect(result.current.expanded).toBe(true);
  });

  it("findDirection is a no-op without a query or target", () => {
    const { addon, target } = terminalParts();
    const { result } = renderHook(() => useInlineSearch(target, null, runtime));
    result.current.findDirection(true);
    expect(addon.findNext).not.toHaveBeenCalled();

    const { result: none } = renderHook(() =>
      useInlineSearch(null, null, runtime),
    );
    expect(() => none.current.findDirection(true)).not.toThrow();
    expect(() => none.current.applyIncremental("x")).not.toThrow();
    expect(() => none.current.clearTarget()).not.toThrow();
    expect(() => none.current.restoreTargetFocus()).not.toThrow();
  });

  it("git-history targets filter live and ignore Enter navigation", () => {
    const handle = { findNext: vi.fn(), findPrevious: vi.fn(), clear: vi.fn() };
    const target = {
      kind: "git-history",
      ...handle,
      focus: vi.fn(),
    } as unknown as NonNullable<SearchTarget>;
    const { result } = renderHook(() => useInlineSearch(target, null, runtime));
    act(() => result.current.setQ("fix"));
    result.current.applyIncremental("fix");
    expect(handle.findNext).toHaveBeenCalledWith(
      "fix",
      expect.objectContaining({ incremental: true }),
    );
    expect(() => result.current.findDirection(true)).not.toThrow();
    result.current.clearTarget();
    expect(handle.clear).toHaveBeenCalled();
  });
});
