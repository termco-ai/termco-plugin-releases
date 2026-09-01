/**
 * Buffer-text readers over a wterm TerminalCore — the replacement for
 * xterm's `line.translateToString(true)`. Buffer lines are addressed
 * as 0 = oldest retained scrollback line … scrollbackCount+rows-1 =
 * last grid row (the core's scrollback offsets count from the newest,
 * so offset = scrollbackCount - 1 - bufferLine).
 *
 * Wide glyphs occupy two cells; the tail cell is a spacer (width 0)
 * that must be skipped so CJK/emoji text reads back without phantom
 * rigs. Cores that don't expose width (the built-in Zig core) place
 * one codepoint per cell, so the skip is a no-op there.
 */
import type { CellData, TerminalCore } from "@wterm/core";

function cellsToText(cells: readonly CellData[]): string {
  let out = "";
  for (const cell of cells) {
    if (cell.width === 0) continue; // wide-glyph spacer tail
    out += String.fromCodePoint(cell.char || 32);
  }
  return out.replace(/\s+$/, "");
}

function scrollbackCells(core: TerminalCore, offset: number): CellData[] {
  if (core.getScrollbackLine) return [...core.getScrollbackLine(offset)];
  const len = core.getScrollbackLineLen(offset);
  const cells: CellData[] = [];
  for (let col = 0; col < len; col++) {
    cells.push(core.getScrollbackCell(offset, col));
  }
  return cells;
}

function gridCells(core: TerminalCore, row: number): CellData[] {
  const cols = core.getCols();
  const cells: CellData[] = [];
  for (let col = 0; col < cols; col++) {
    cells.push(core.getCell(row, col));
  }
  return cells;
}

/** Text of one buffer line (scrollback or grid), right-trimmed. */
export function bufferLineText(core: TerminalCore, bufferLine: number): string {
  const sb = core.getScrollbackCount();
  if (bufferLine < 0) return "";
  if (bufferLine < sb)
    return cellsToText(scrollbackCells(core, sb - 1 - bufferLine));
  const row = bufferLine - sb;
  if (row >= core.getRows()) return "";
  return cellsToText(gridCells(core, row));
}

/** Total addressable buffer lines (scrollback + grid). */
export function bufferLineCount(core: TerminalCore): number {
  return core.getScrollbackCount() + core.getRows();
}

/**
 * The last `maxLines` of buffer text joined with newlines, trailing
 * blank lines dropped — mirrors the app's xterm-era `getBuffer`.
 */
export function bufferTail(core: TerminalCore, maxLines: number): string {
  const total = bufferLineCount(core);
  const start = Math.max(0, total - maxLines);
  const lines: string[] = [];
  for (let i = start; i < total; i++) {
    lines.push(bufferLineText(core, i));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** True if any visible grid cell has a non-space glyph (watermark gate). */
export function viewportHasGlyphs(core: TerminalCore): boolean {
  const rows = core.getRows();
  const cols = core.getCols();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = core.getCell(r, c).char;
      if (ch !== 0 && ch !== 32) return true;
    }
  }
  return false;
}
