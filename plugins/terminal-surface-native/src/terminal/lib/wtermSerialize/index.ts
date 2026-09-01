/**
 * Serialize terminal text, SGR styles, cursor state, and input modes for
 * lossless replay into a same-size fresh terminal. Alternate-screen content is
 * omitted because its owning TUI must repaint after resize.
 */
import type { CellData, TerminalCore } from "@wterm/core";
import { cellStyle, isDefaultStyle, sgrSequence, styleKey } from "./sgr";

export type SerializeOptions = {
  /** Cap over the total buffer tail (scrollback + grid lines). */
  maxLines: number;
  /** PTY-side input modes to replay in the trailer. */
  modes?: {
    bracketedPaste: boolean;
    cursorKeysApp: boolean;
    mouseTracking: "none" | "click" | "drag" | "motion";
    sgrMouse: boolean;
  };
};

export type WtermSnapshot = {
  /** ANSI payload reproducing text + colors + attributes + cursor. */
  data: string;
  /** Buffer lines serialized (for line-anchor rebasing on restore). */
  lines: number;
};

const RESET = "\x1b[0m";
const DEFAULT_KEY = styleKey({ fg: 256, bg: 256, flags: 0 });

const MOUSE_DECSET: Record<string, string> = {
  none: "",
  click: "\x1b[?1000h",
  drag: "\x1b[?1002h",
  motion: "\x1b[?1003h",
};

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

function isBlankChar(char: number): boolean {
  return char === 0 || char === 32;
}

/**
 * One line as text + SGR runs. Trailing DEFAULT-styled whitespace is
 * trimmed; styled trailing spaces are preserved (they paint background
 * color). Wide-glyph spacer cells (width 0) are skipped — the wide
 * codepoint itself advances two columns on replay.
 */
function serializeLine(cells: readonly CellData[]): string {
  let end = cells.length;
  while (end > 0) {
    const cell = cells[end - 1];
    if (cell.width === 0) break; // wide-glyph tail: content, not padding
    if (!isBlankChar(cell.char)) break;
    if (!isDefaultStyle(cellStyle(cell))) break;
    end--;
  }
  let out = "";
  let currentKey = DEFAULT_KEY;
  for (let i = 0; i < end; i++) {
    const cell = cells[i];
    if (cell.width === 0) continue;
    const style = cellStyle(cell);
    const key = styleKey(style);
    if (key !== currentKey) {
      out += sgrSequence(style);
      currentKey = key;
    }
    out += String.fromCodePoint(cell.char || 32);
  }
  if (currentKey !== DEFAULT_KEY) out += RESET;
  return out;
}

function modeReplay(modes: SerializeOptions["modes"]): string {
  if (!modes) return "";
  let out = "";
  if (modes.bracketedPaste) out += "\x1b[?2004h";
  if (modes.cursorKeysApp) out += "\x1b[?1h";
  out += MOUSE_DECSET[modes.mouseTracking] ?? "";
  if (modes.sgrMouse) out += "\x1b[?1006h";
  return out;
}

export function serializeTerminal(
  core: TerminalCore,
  opts: SerializeOptions,
): WtermSnapshot {
  const alt = core.usingAltScreen();
  const scrollback = core.getScrollbackCount();
  const total = scrollback + (alt ? 0 : core.getRows());
  const start = Math.max(0, total - opts.maxLines);

  const lines: string[] = [];
  for (let i = start; i < total; i++) {
    const cells =
      i < scrollback
        ? scrollbackCells(core, scrollback - 1 - i)
        : gridCells(core, i - scrollback);
    lines.push(serializeLine(cells));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const modes = modeReplay(opts.modes);
  if (lines.length === 0) return { data: modes, lines: 0 };

  let data = lines.join("\r\n");
  data += RESET;
  const cursor = core.getCursor();
  data += cursor.visible ? "\x1b[?25h" : "\x1b[?25l";
  if (!alt) data += `\x1b[${cursor.row + 1};${cursor.col + 1}H`;
  data += modes;
  return { data, lines: lines.length };
}
