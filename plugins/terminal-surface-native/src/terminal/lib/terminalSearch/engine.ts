/**
 * Pure match scanning over a wterm TerminalCore — the wterm replacement
 * for xterm's SearchAddon internals. Scans the full addressable buffer
 * (scrollback + grid, oldest first) line by line via the lineReader,
 * so matches are ordered top-to-bottom, left-to-right.
 *
 * Literal substring matching only: no regex, no cross-line matches.
 */
import type { TerminalCore } from "@wterm/core";
import { bufferLineCount, bufferLineText } from "../engine/lineReader";

export type SearchMatch = {
  /** Buffer line index: 0 = oldest scrollback line (lineReader addressing). */
  bufferLine: number;
  /**
   * CHARACTER index of the match in the trimmed line text — not the
   * terminal cell column. Highlights map matches onto row text nodes by
   * character offset, and wide glyphs (CJK/emoji) occupy two cells but
   * one character, so cell column != char index on such lines.
   */
  col: number;
  /** Match length in characters (== query length). */
  length: number;
};

export type ScanOptions = {
  /** Match case exactly. Default false (case-insensitive). */
  caseSensitive?: boolean;
  /** Stop scanning once this many matches are found. Default 2000. */
  maxMatches?: number;
};

export const DEFAULT_MAX_MATCHES = 2000;

/**
 * Find every (non-overlapping) occurrence of `query` in the buffer,
 * capped at `maxMatches`. Empty queries match nothing.
 */
export function scanBuffer(
  core: TerminalCore,
  query: string,
  opts: ScanOptions = {},
): SearchMatch[] {
  if (!query) return [];
  const caseSensitive = opts.caseSensitive ?? false;
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: SearchMatch[] = [];
  const total = bufferLineCount(core);
  for (let line = 0; line < total && matches.length < maxMatches; line++) {
    const raw = bufferLineText(core, line);
    if (!raw) continue;
    const haystack = caseSensitive ? raw : raw.toLowerCase();
    let from = 0;
    while (matches.length < maxMatches) {
      const col = haystack.indexOf(needle, from);
      if (col === -1) break;
      matches.push({ bufferLine: line, col, length: needle.length });
      from = col + needle.length;
    }
  }
  return matches;
}
