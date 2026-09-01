/**
 * Palette reverse-mapping for the ghostty core. Ghostty resolves every
 * ANSI palette color to concrete RGB inside the wasm (its default
 * "Tomorrow Night" palette), which would bypass the app's CSS-variable
 * theme: the DOM renderer only uses `var(--term-color-N)` when a cell
 * carries a palette INDEX. This wrapper maps ghostty's known palette
 * RGB values back to indices so ANSI-16 colors stay themeable and the
 * 256-color cube renders through the renderer's standard formula.
 *
 * A truecolor cell that happens to equal a palette entry gets themed
 * too — the same ambiguity xterm.js has, and visually desirable.
 */
import type { CellData, TerminalCore } from "@wterm/core";

/** ghostty 1.3.1 default palette (probe-verified against the wasm). */
const GHOSTTY_ANSI16 = [
  0x1d1f21, 0xcc6666, 0xb5bd68, 0xf0c674, 0x81a2be, 0xb294bb, 0x8abeb7,
  0xc5c8c6, 0x666666, 0xd54e53, 0xb9ca4a, 0xe7c547, 0x7aa6da, 0xc397d8,
  0x70c0b1, 0xeaeaea,
];

const ANSI16_TO_INDEX = new Map<number, number>(
  GHOSTTY_ANSI16.map((rgb, i) => [rgb, i]),
);

/** Standard xterm 256-cube component levels (0, 95, 135, 175, 215, 255). */
const CUBE_LEVELS = [0, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
const CUBE_INDEX = new Map<number, number>(CUBE_LEVELS.map((v, i) => [v, i]));

/** RGB (0xRRGGBB) → palette index when it exactly matches a known entry. */
export function rgbToPaletteIndex(rgb: number): number | null {
  const ansi = ANSI16_TO_INDEX.get(rgb);
  if (ansi !== undefined) return ansi;

  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;

  // Grayscale ramp: 232-255 = 8 + 10*n.
  if (r === g && g === b && (r - 8) % 10 === 0) {
    const n = (r - 8) / 10;
    if (n >= 0 && n < 24) return 232 + n;
  }

  const ri = CUBE_INDEX.get(r);
  const gi = CUBE_INDEX.get(g);
  const bi = CUBE_INDEX.get(b);
  if (ri !== undefined && gi !== undefined && bi !== undefined) {
    return 16 + 36 * ri + 6 * gi + bi;
  }
  return null;
}

function remapCell(cell: CellData): CellData {
  let changed = false;
  let fg = cell.fg;
  let bg = cell.bg;
  let fgRgb = cell.fgRgb;
  let bgRgb = cell.bgRgb;

  if (fgRgb !== undefined) {
    const idx = rgbToPaletteIndex(fgRgb);
    if (idx !== null) {
      fg = idx;
      fgRgb = undefined;
      changed = true;
    }
  }
  if (bgRgb !== undefined) {
    const idx = rgbToPaletteIndex(bgRgb);
    if (idx !== null) {
      bg = idx;
      bgRgb = undefined;
      changed = true;
    }
  }
  if (!changed) return cell;

  const out: CellData = { ...cell, fg, bg };
  if (fgRgb === undefined) delete out.fgRgb;
  else out.fgRgb = fgRgb;
  if (bgRgb === undefined) delete out.bgRgb;
  else out.bgRgb = bgRgb;
  return out;
}

/**
 * Wrap a core so all cell reads carry palette indices where possible.
 * A pure forwarding facade: every call executes on the underlying core
 * (all mutable state stays there — a prototype-based wrapper would
 * split state between the two objects), with cell outputs remapped.
 */
export function withPaletteMapping(core: TerminalCore): TerminalCore {
  const wrapped: TerminalCore = {
    init: (cols, rows) => core.init(cols, rows),
    resize: (cols, rows) => core.resize(cols, rows),
    writeString: (str) => core.writeString(str),
    writeRaw: (data) => core.writeRaw(data),
    getCell: (row, col) => remapCell(core.getCell(row, col)),
    isDirtyRow: (row) => core.isDirtyRow(row),
    clearDirty: () => core.clearDirty(),
    getCols: () => core.getCols(),
    getRows: () => core.getRows(),
    getCursor: () => core.getCursor(),
    cursorKeysApp: () => core.cursorKeysApp(),
    bracketedPaste: () => core.bracketedPaste(),
    usingAltScreen: () => core.usingAltScreen(),
    getTitle: () => core.getTitle(),
    getResponse: () => core.getResponse(),
    getScrollbackCount: () => core.getScrollbackCount(),
    getScrollbackCell: (offset, col) =>
      remapCell(core.getScrollbackCell(offset, col)),
    getScrollbackLineLen: (offset) => core.getScrollbackLineLen(offset),
    getUnhandledSequences: () => core.getUnhandledSequences(),
  };
  if (core.getScrollbackLine) {
    wrapped.getScrollbackLine = (offset) =>
      (core.getScrollbackLine?.(offset) ?? []).map(remapCell);
  }
  return wrapped;
}
