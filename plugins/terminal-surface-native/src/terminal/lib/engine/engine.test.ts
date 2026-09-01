// Kept with the source-owning terminal plugin.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CellData, TerminalCore } from "@wterm/core";
import { computeGrid } from "./fit";
import {
  bufferLineCount,
  bufferLineText,
  bufferTail,
  viewportHasGlyphs,
} from "./lineReader";
import { serializeLite } from "./serializeLite";
import { rgbToPaletteIndex, withPaletteMapping } from "./themedCore";

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/**
 * Fake core over an array of scrollback strings (oldest first) and
 * grid strings. Cell chars only; width defaults to 1.
 */
function fakeCore(
  scrollback: string[],
  grid: string[],
  cols = 20,
): TerminalCore {
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
    getCols: () => cols,
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

describe("lineReader", () => {
  const core = fakeCore(["old-1", "old-2", "old-3"], ["grid-a", "grid-b", ""]);

  it("addresses buffer lines oldest-first across scrollback and grid", () => {
    expect(bufferLineText(core, 0)).toBe("old-1");
    expect(bufferLineText(core, 2)).toBe("old-3");
    expect(bufferLineText(core, 3)).toBe("grid-a");
    expect(bufferLineText(core, 5)).toBe("");
    expect(bufferLineCount(core)).toBe(6);
  });

  it("returns empty outside the buffer", () => {
    expect(bufferLineText(core, -1)).toBe("");
    expect(bufferLineText(core, 99)).toBe("");
  });

  it("skips wide-glyph spacer cells", () => {
    const wide: TerminalCore = {
      ...fakeCore([], ["x"]),
      getCell: (_row, col): CellData =>
        [
          { ...BLANK, char: 0x4f60, width: 2 },
          { ...BLANK, char: 32, width: 0 },
          { ...BLANK, char: 97, width: 1 },
        ][col] ?? BLANK,
      getCols: () => 3,
      getRows: () => 1,
    };
    expect(bufferLineText(wide, 0)).toBe("你a");
  });

  it("builds a trailing-trimmed tail", () => {
    expect(bufferTail(core, 4)).toBe("old-3\ngrid-a\ngrid-b");
    expect(bufferTail(core, 3)).toBe("grid-a\ngrid-b");
    expect(bufferTail(core, 2)).toBe("grid-b");
  });

  it("detects glyphs in the viewport", () => {
    expect(viewportHasGlyphs(core)).toBe(true);
    expect(viewportHasGlyphs(fakeCore([], ["", "  "]))).toBe(false);
  });
});

describe("serializeLite", () => {
  it("serializes the capped tail with CRLF joins", () => {
    const core = fakeCore(["a", "b"], ["c", ""]);
    expect(serializeLite(core, 10)).toEqual({ data: "a\r\nb\r\nc", lines: 3 });
    expect(serializeLite(core, 2).data).toBe("c");
  });
});

describe("computeGrid", () => {
  it("floors to whole cells with minimums", () => {
    expect(computeGrid(800, 480, { width: 8, height: 16 })).toEqual({
      cols: 100,
      rows: 30,
    });
    expect(computeGrid(5, 5, { width: 8, height: 16 })).toEqual({
      cols: 2,
      rows: 1,
    });
  });
});

describe("themedCore palette reverse-mapping", () => {
  it("maps ghostty ANSI-16 RGB back to indices", () => {
    expect(rgbToPaletteIndex(0xcc6666)).toBe(1);
    expect(rgbToPaletteIndex(0xeaeaea)).toBe(15);
  });

  it("maps the standard 256 cube and grayscale ramp", () => {
    expect(rgbToPaletteIndex(0x87ff87)).toBe(120);
    expect(rgbToPaletteIndex(0x080808)).toBe(232);
    expect(rgbToPaletteIndex(0xeeeeee)).toBe(255);
  });

  it("returns null for arbitrary truecolor", () => {
    expect(rgbToPaletteIndex(0x010203)).toBeNull();
  });

  it("rewrites cells through the wrapper, preserving unknowns", () => {
    const base = fakeCore([], ["x"]);
    base.getCell = () => ({
      ...BLANK,
      char: 120,
      fgRgb: 0xcc6666,
      bgRgb: 0x010203,
    });
    const wrapped = withPaletteMapping(base);
    const cell = wrapped.getCell(0, 0);
    expect(cell.fg).toBe(1);
    expect(cell.fgRgb).toBeUndefined();
    expect(cell.bgRgb).toBe(0x010203);
  });
});
