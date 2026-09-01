/**
 * SGR (Select Graphic Rendition) emission for the buffer serializer.
 *
 * A cell's style is the tuple (fg, bg, flags, fgRgb, bgRgb) as it
 * arrives after the app's palette mapping: ANSI-16/256 colors are
 * palette indices in `fg`/`bg` (256 = default), unmatched truecolor is
 * `fgRgb`/`bgRgb` (0xRRGGBB). At every run boundary we emit a full
 * reset-then-set sequence — stateless and self-describing, no
 * attribute diffing.
 */
import type { CellData } from "@wterm/core";

/** Palette index the core uses for "default color" (no SGR needed). */
const DEFAULT_COLOR = 256;

export type CellStyle = {
  fg: number;
  bg: number;
  flags: number;
  fgRgb?: number;
  bgRgb?: number;
};

export function cellStyle(cell: CellData): CellStyle {
  return {
    fg: cell.fg,
    bg: cell.bg,
    flags: cell.flags,
    fgRgb: cell.fgRgb,
    bgRgb: cell.bgRgb,
  };
}

/** Stable identity key for run-boundary detection. */
export function styleKey(style: CellStyle): string {
  return `${style.fg}|${style.bg}|${style.flags}|${style.fgRgb ?? -1}|${
    style.bgRgb ?? -1
  }`;
}

export function isDefaultStyle(style: CellStyle): boolean {
  return (
    style.flags === 0 &&
    style.fg === DEFAULT_COLOR &&
    style.bg === DEFAULT_COLOR &&
    style.fgRgb === undefined &&
    style.bgRgb === undefined
  );
}

/** CellData.flags bit → SGR attribute code. */
const FLAG_CODES: ReadonlyArray<readonly [number, number]> = [
  [0x01, 1], // bold
  [0x02, 2], // faint
  [0x04, 3], // italic
  [0x08, 4], // underline
  [0x10, 5], // blink
  [0x20, 7], // inverse
  [0x40, 8], // invisible
  [0x80, 9], // strikethrough
];

function pushRgb(params: number[], introducer: number, rgb: number): void {
  params.push(introducer, 2, (rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
}

/**
 * Full reset-then-set SGR for a style; `\x1b[0m` for the default.
 * Colors: `38;5;N` / `48;5;N` for palette indices below 256,
 * `38;2;r;g;b` / `48;2;r;g;b` for truecolor, nothing for the default
 * (the leading reset already restores it).
 */
export function sgrSequence(style: CellStyle): string {
  const params: number[] = [0];
  for (const [bit, code] of FLAG_CODES) {
    if ((style.flags & bit) !== 0) params.push(code);
  }
  if (style.fgRgb !== undefined) {
    pushRgb(params, 38, style.fgRgb);
  } else if (style.fg < DEFAULT_COLOR) {
    params.push(38, 5, style.fg);
  }
  if (style.bgRgb !== undefined) {
    pushRgb(params, 48, style.bgRgb);
  } else if (style.bg < DEFAULT_COLOR) {
    params.push(48, 5, style.bg);
  }
  return `\x1b[${params.join(";")}m`;
}
