// Kept with the source-owning terminal plugin.
// @vitest-environment node
import type { CellData, TerminalCore } from "@wterm/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_MATCHES, scanBuffer } from "./engine";

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/**
 * Fake core over scrollback strings (oldest first) and grid strings,
 * mirroring engine.test.ts's fakeCore. One codepoint per cell, width 1.
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

describe("scanBuffer", () => {
  it("finds literal matches across scrollback and grid, oldest first", () => {
    const core = fakeCore(["alpha foo", "bar"], ["foo baz", "no hit"]);
    expect(scanBuffer(core, "foo")).toEqual([
      { bufferLine: 0, col: 6, length: 3 },
      { bufferLine: 2, col: 0, length: 3 },
    ]);
  });

  it("reports multiple non-overlapping matches per line", () => {
    const core = fakeCore([], ["ab ab ab", "ababab"]);
    expect(scanBuffer(core, "ab")).toEqual([
      { bufferLine: 0, col: 0, length: 2 },
      { bufferLine: 0, col: 3, length: 2 },
      { bufferLine: 0, col: 6, length: 2 },
      { bufferLine: 1, col: 0, length: 2 },
      { bufferLine: 1, col: 2, length: 2 },
      { bufferLine: 1, col: 4, length: 2 },
    ]);
    // Non-overlapping: "aaa" holds one "aa", not two.
    expect(scanBuffer(fakeCore([], ["aaa"]), "aa")).toHaveLength(1);
  });

  it("is case-insensitive by default, case-sensitive on request", () => {
    const core = fakeCore([], ["Foo FOO foo"]);
    expect(scanBuffer(core, "foo")).toHaveLength(3);
    expect(scanBuffer(core, "FoO")).toHaveLength(3);
    expect(scanBuffer(core, "foo", { caseSensitive: true })).toEqual([
      { bufferLine: 0, col: 8, length: 3 },
    ]);
    expect(scanBuffer(core, "FOO", { caseSensitive: true })).toEqual([
      { bufferLine: 0, col: 4, length: 3 },
    ]);
  });

  it("treats the query literally, not as a regex", () => {
    const core = fakeCore([], ["abc a.c a*c"]);
    expect(scanBuffer(core, "a.c")).toEqual([
      { bufferLine: 0, col: 4, length: 3 },
    ]);
    expect(scanBuffer(core, "a*c")).toEqual([
      { bufferLine: 0, col: 8, length: 3 },
    ]);
  });

  it("returns [] for an empty query", () => {
    const core = fakeCore([], ["anything"]);
    expect(scanBuffer(core, "")).toEqual([]);
  });

  it("caps at maxMatches and stops scanning", () => {
    const core = fakeCore(
      Array.from({ length: 10 }, () => "hit hit hit"),
      ["hit"],
    );
    expect(scanBuffer(core, "hit")).toHaveLength(31);
    const capped = scanBuffer(core, "hit", { maxMatches: 5 });
    expect(capped).toHaveLength(5);
    expect(capped[4]).toEqual({ bufferLine: 1, col: 4, length: 3 });
    expect(DEFAULT_MAX_MATCHES).toBe(2000);
  });

  it("reports col as a CHARACTER index on wide-glyph lines", () => {
    // "你a" — the wide glyph spans cells 0-1 (spacer tail at cell 1),
    // so "a" sits in CELL 2 but is CHARACTER 1 of the trimmed text.
    const cells: CellData[] = [
      { ...BLANK, char: 0x4f60, width: 2 },
      { ...BLANK, char: 32, width: 0 },
      { ...BLANK, char: 97, width: 1 },
    ];
    const wide: TerminalCore = {
      ...fakeCore([], ["x"]),
      getCell: (_row, col): CellData => cells[col] ?? BLANK,
      getCols: () => 3,
      getRows: () => 1,
    };
    expect(scanBuffer(wide, "a")).toEqual([
      { bufferLine: 0, col: 1, length: 1 },
    ]);
    expect(scanBuffer(wide, "你a")).toEqual([
      { bufferLine: 0, col: 0, length: 2 },
    ]);
  });
});
