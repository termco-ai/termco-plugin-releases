// Kept with the source-owning terminal plugin.
// @vitest-environment node
import type { CellData, CursorState, TerminalCore } from "@wterm/core";
import { describe, expect, it } from "vitest";
import { type SerializeOptions, serializeTerminal } from "./index";
import { sgrSequence, styleKey } from "./sgr";

const BLANK: CellData = { char: 32, fg: 256, bg: 256, flags: 0 };

/** Cells for a string, all sharing optional style overrides. */
function cells(text: string, style: Partial<CellData> = {}): CellData[] {
  return [...text].map((ch) => ({
    ...BLANK,
    ...style,
    char: ch.codePointAt(0) ?? 32,
  }));
}

type FakeOpts = {
  /** Oldest-first scrollback lines. */
  scrollback?: CellData[][];
  grid?: CellData[][];
  cols?: number;
  cursor?: CursorState;
  altScreen?: boolean;
  /** Expose the optional bulk getScrollbackLine (default true). */
  bulkScrollback?: boolean;
};

/** Cell-level fake core, in the spirit of engine.test.ts's fakeCore. */
function fakeCore(opts: FakeOpts = {}): TerminalCore {
  const scrollback = opts.scrollback ?? [];
  const grid = opts.grid ?? [];
  const cols = opts.cols ?? 20;
  const sbLine = (offset: number): CellData[] =>
    scrollback[scrollback.length - 1 - offset] ?? [];
  const core: TerminalCore = {
    init() {},
    resize() {},
    writeString() {},
    writeRaw() {},
    getCell(row, col) {
      return grid[row]?.[col] ?? BLANK;
    },
    isDirtyRow: () => false,
    clearDirty() {},
    getCols: () => cols,
    getRows: () => grid.length,
    getCursor: () => opts.cursor ?? { row: 0, col: 0, visible: true },
    cursorKeysApp: () => false,
    bracketedPaste: () => false,
    usingAltScreen: () => opts.altScreen ?? false,
    getTitle: () => null,
    getResponse: () => null,
    getScrollbackCount: () => scrollback.length,
    getScrollbackCell: (offset, col) => sbLine(offset)[col] ?? BLANK,
    getScrollbackLineLen: (offset) => sbLine(offset).length,
    getUnhandledSequences: () => [],
  };
  if (opts.bulkScrollback !== false) core.getScrollbackLine = sbLine;
  return core;
}

/** Default trailer: reset, cursor visible, home (primary screen). */
const TRAILER = "\x1b[0m\x1b[?25h\x1b[1;1H";

describe("serializeTerminal", () => {
  it("round-trips plain text as CRLF-joined lines plus trailer", () => {
    const core = fakeCore({
      scrollback: [cells("old-1"), cells("old-2")],
      grid: [cells("grid-a"), cells("grid-b")],
    });
    expect(serializeTerminal(core, { maxLines: 10 })).toEqual({
      data: `old-1\r\nold-2\r\ngrid-a\r\ngrid-b${TRAILER}`,
      lines: 4,
    });
  });

  it("reads scrollback per cell when bulk reads are unavailable", () => {
    const opts = {
      scrollback: [cells("aa"), cells("bb", { fg: 3 })],
      grid: [cells("cc")],
    };
    const bulk = serializeTerminal(fakeCore(opts), { maxLines: 10 });
    const perCell = serializeTerminal(
      fakeCore({ ...opts, bulkScrollback: false }),
      { maxLines: 10 },
    );
    expect(perCell).toEqual(bulk);
    expect(perCell.data).toContain("\x1b[0;38;5;3mbb\x1b[0m");
  });

  describe("SGR runs", () => {
    const line = (row: CellData[]): string => {
      const snap = serializeTerminal(fakeCore({ grid: [row] }), {
        maxLines: 10,
      });
      expect(snap.data.endsWith(TRAILER)).toBe(true);
      return snap.data.slice(0, -TRAILER.length);
    };

    it("emits one sequence per run and resets back to default", () => {
      expect(line([...cells("red", { fg: 1 }), ...cells("x")])).toBe(
        "\x1b[0;38;5;1mred\x1b[0mx",
      );
    });

    it("keeps same-style neighbours in a single run", () => {
      expect(line(cells("ab", { fg: 2 }))).toBe("\x1b[0;38;5;2mab\x1b[0m");
    });

    it("emits palette foregrounds as 38;5;N", () => {
      expect(line(cells("p", { fg: 196 }))).toBe("\x1b[0;38;5;196mp\x1b[0m");
    });

    it("emits truecolor foregrounds as 38;2;r;g;b", () => {
      expect(line(cells("t", { fgRgb: 0x123456 }))).toBe(
        "\x1b[0;38;2;18;52;86mt\x1b[0m",
      );
    });

    it("emits palette and truecolor backgrounds with 48", () => {
      expect(line(cells("b", { bg: 4 }))).toBe("\x1b[0;48;5;4mb\x1b[0m");
      expect(line(cells("b", { bgRgb: 0x0a0b0c }))).toBe(
        "\x1b[0;48;2;10;11;12mb\x1b[0m",
      );
    });

    it.each([
      [0x01, 1, "bold"],
      [0x02, 2, "faint"],
      [0x04, 3, "italic"],
      [0x08, 4, "underline"],
      [0x10, 5, "blink"],
      [0x20, 7, "inverse"],
      [0x40, 8, "invisible"],
      [0x80, 9, "strikethrough"],
    ])("maps flag 0x%s to SGR code %i (%s)", (bit, code) => {
      expect(line(cells("f", { flags: bit }))).toBe(`\x1b[0;${code}mf\x1b[0m`);
    });

    it("combines bold+underline+strikethrough in one sequence", () => {
      expect(line(cells("c", { flags: 0x01 | 0x08 | 0x80 }))).toBe(
        "\x1b[0;1;4;9mc\x1b[0m",
      );
    });

    it("combines attributes with fg and bg colors", () => {
      expect(line(cells("z", { flags: 0x01, fg: 2, bg: 15 }))).toBe(
        "\x1b[0;1;38;5;2;48;5;15mz\x1b[0m",
      );
    });
  });

  it("skips wide-glyph spacer cells", () => {
    const core = fakeCore({
      grid: [
        [
          { ...BLANK, char: 0x4f60, width: 2 },
          { ...BLANK, char: 32, width: 0 },
          { ...BLANK, char: 97, width: 1 },
        ],
      ],
      cols: 3,
    });
    expect(serializeTerminal(core, { maxLines: 10 }).data).toBe(
      `你a${TRAILER}`,
    );
  });

  it("trims trailing default whitespace but preserves styled spaces", () => {
    const plain = fakeCore({ grid: [cells("hi   ")] });
    expect(serializeTerminal(plain, { maxLines: 10 }).data).toBe(
      `hi${TRAILER}`,
    );
    const painted = fakeCore({
      grid: [[...cells("hi"), ...cells("  ", { bg: 4 })]],
    });
    expect(serializeTerminal(painted, { maxLines: 10 }).data).toBe(
      `hi\x1b[0;48;5;4m  \x1b[0m${TRAILER}`,
    );
  });

  it("windows to the last maxLines and reports the count", () => {
    const core = fakeCore({
      scrollback: [cells("a"), cells("b"), cells("c"), cells("d")],
      grid: [cells("e"), cells("f")],
    });
    expect(serializeTerminal(core, { maxLines: 3 })).toEqual({
      data: `d\r\ne\r\nf${TRAILER}`,
      lines: 3,
    });
    expect(serializeTerminal(core, { maxLines: 100 }).lines).toBe(6);
  });

  it("drops trailing blank lines from the count", () => {
    const core = fakeCore({
      grid: [cells("top"), cells(""), cells("")],
    });
    expect(serializeTerminal(core, { maxLines: 10 })).toEqual({
      data: `top${TRAILER}`,
      lines: 1,
    });
  });

  it("serializes scrollback only on the alt screen, without cursor", () => {
    const core = fakeCore({
      scrollback: [cells("shell-1"), cells("shell-2")],
      grid: [cells("TUI FRAME")],
      altScreen: true,
      cursor: { row: 0, col: 3, visible: true },
    });
    expect(serializeTerminal(core, { maxLines: 10 })).toEqual({
      data: "shell-1\r\nshell-2\x1b[0m\x1b[?25h",
      lines: 2,
    });
  });

  it("replays cursor visibility and position", () => {
    const core = fakeCore({
      grid: [cells("x")],
      cursor: { row: 2, col: 5, visible: false },
    });
    expect(serializeTerminal(core, { maxLines: 10 }).data).toBe(
      "x\x1b[0m\x1b[?25l\x1b[3;6H",
    );
  });

  describe("mode replay trailer", () => {
    const modes = (m: NonNullable<SerializeOptions["modes"]>): string =>
      serializeTerminal(fakeCore({ grid: [cells("x")] }), {
        maxLines: 10,
        modes: m,
      }).data.slice(`x${TRAILER}`.length);

    it("emits nothing when all modes are off", () => {
      expect(
        modes({
          bracketedPaste: false,
          cursorKeysApp: false,
          mouseTracking: "none",
          sgrMouse: false,
        }),
      ).toBe("");
    });

    it("emits DECSET per enabled mode", () => {
      expect(
        modes({
          bracketedPaste: true,
          cursorKeysApp: true,
          mouseTracking: "motion",
          sgrMouse: true,
        }),
      ).toBe("\x1b[?2004h\x1b[?1h\x1b[?1003h\x1b[?1006h");
      expect(
        modes({
          bracketedPaste: false,
          cursorKeysApp: false,
          mouseTracking: "click",
          sgrMouse: false,
        }),
      ).toBe("\x1b[?1000h");
      expect(
        modes({
          bracketedPaste: false,
          cursorKeysApp: false,
          mouseTracking: "drag",
          sgrMouse: true,
        }),
      ).toBe("\x1b[?1002h\x1b[?1006h");
    });
  });

  it("returns an empty snapshot for an empty buffer", () => {
    const core = fakeCore({ grid: [cells(""), cells("   ")] });
    expect(serializeTerminal(core, { maxLines: 10 })).toEqual({
      data: "",
      lines: 0,
    });
  });

  it("still replays modes when the buffer is empty", () => {
    const core = fakeCore({ grid: [cells("")] });
    expect(
      serializeTerminal(core, {
        maxLines: 10,
        modes: {
          bracketedPaste: true,
          cursorKeysApp: false,
          mouseTracking: "none",
          sgrMouse: false,
        },
      }),
    ).toEqual({ data: "\x1b[?2004h", lines: 0 });
  });

  it("is deterministic for identical input", () => {
    const core = fakeCore({
      scrollback: [cells("s", { fg: 1, flags: 0x01 })],
      grid: [[...cells("g", { bgRgb: 0x336699 }), ...cells("  ")]],
      cursor: { row: 1, col: 2, visible: true },
    });
    const opts = {
      maxLines: 5,
      modes: {
        bracketedPaste: true,
        cursorKeysApp: true,
        mouseTracking: "drag" as const,
        sgrMouse: true,
      },
    };
    expect(serializeTerminal(core, opts)).toEqual(
      serializeTerminal(core, opts),
    );
  });
});

describe("sgr helpers", () => {
  it("keys distinguish palette from truecolor and default", () => {
    const base = { fg: 256, bg: 256, flags: 0 };
    expect(styleKey({ ...base, fg: 1 })).not.toBe(styleKey(base));
    expect(styleKey({ ...base, fgRgb: 1 })).not.toBe(
      styleKey({ ...base, fg: 1 }),
    );
    expect(styleKey({ ...base })).toBe(styleKey({ ...base }));
  });

  it("collapses the default style to a bare reset", () => {
    expect(sgrSequence({ fg: 256, bg: 256, flags: 0 })).toBe("\x1b[0m");
  });
});
