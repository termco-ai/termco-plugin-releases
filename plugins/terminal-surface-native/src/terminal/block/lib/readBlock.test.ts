// Kept with the source-owning terminal plugin.
// @vitest-environment node
import type { CellData, TerminalCore } from "@wterm/core";
import { describe, expect, it } from "vitest";
import { readRangeText } from "./readBlock";

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/**
 * Fake core over an array of scrollback strings (oldest first) and grid
 * strings — same shape as the engine test suite's fakeCore.
 */
function fakeCore(scrollback: string[], grid: string[]): TerminalCore {
  const cellsOf = (s: string): CellData[] =>
    [...s].map((ch) => ({ ...BLANK, char: ch.codePointAt(0) ?? 32 }));
  return {
    init() {},
    resize() {},
    writeString() {},
    writeRaw() {},
    getCell(row, col) {
      const line = grid[row] ?? "";
      return cellsOf(line)[col] ?? BLANK;
    },
    isDirtyRow: () => false,
    clearDirty() {},
    getCols: () => 20,
    getRows: () => grid.length,
    getCursor: () => ({ row: 0, col: 0, visible: true }),
    cursorKeysApp: () => false,
    bracketedPaste: () => false,
    usingAltScreen: () => false,
    getTitle: () => null,
    getResponse: () => null,
    getScrollbackCount: () => scrollback.length,
    getScrollbackCell(offset, col) {
      const line = scrollback[scrollback.length - 1 - offset] ?? "";
      return cellsOf(line)[col] ?? BLANK;
    },
    getScrollbackLineLen(offset) {
      return (scrollback[scrollback.length - 1 - offset] ?? "").length;
    },
    getUnhandledSequences: () => [],
  };
}

describe("readRangeText", () => {
  it("reads an inclusive line range", () => {
    const core = fakeCore([], ["$ ls", "a", "b", "$ next"]);
    expect(readRangeText(core, 1, 2)).toBe("a\nb");
  });

  it("reads across the scrollback/grid boundary", () => {
    const core = fakeCore(["old-1", "old-2"], ["grid-a"]);
    expect(readRangeText(core, 0, 2)).toBe("old-1\nold-2\ngrid-a");
  });

  it("clamps the start to the first line", () => {
    const core = fakeCore([], ["one", "two"]);
    expect(readRangeText(core, -5, 1)).toBe("one\ntwo");
  });

  it("clamps the end to the buffer length", () => {
    const core = fakeCore([], ["one", "two"]);
    expect(readRangeText(core, 0, 99)).toBe("one\ntwo");
  });

  it("trims trailing empty lines but keeps interior blanks", () => {
    const core = fakeCore([], ["head", "", "tail", "", ""]);
    expect(readRangeText(core, 0, 4)).toBe("head\n\ntail");
  });

  it("returns an empty string for an all-blank range", () => {
    const core = fakeCore([], ["", "", ""]);
    expect(readRangeText(core, 0, 2)).toBe("");
  });

  it("returns an empty string when the range is inverted", () => {
    const core = fakeCore([], ["a", "b"]);
    expect(readRangeText(core, 1, 0)).toBe("");
  });

  it("right-trims trailing whitespace on each line", () => {
    const core = fakeCore([], ["abc   ", "x"]);
    expect(readRangeText(core, 0, 1)).toBe("abc\nx");
  });
});
