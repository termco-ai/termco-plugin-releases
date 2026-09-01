/**
 * Pure URL detection over a line of terminal text — the replacement
 * for xterm's WebLinksAddon matcher.
 *
 * Choices (mirroring the addon's liberal matcher, simplified):
 * - http:// and https:// only, case-sensitive (terminal output is
 *   overwhelmingly lowercase; other schemes are out of scope).
 * - The body is any run of non-whitespace excluding `"`, `'`, `<`, `>`
 *   so URLs embedded in quotes/HTML-ish output stop at the delimiter.
 *   `)` and `]` ARE allowed inside so wikipedia-style paths survive.
 * - Trailing punctuation `.,:;!?` is trimmed (prose like "see
 *   https://x.dev." should not include the period).
 * - Trailing `)` / `]` are trimmed only while unbalanced within the
 *   match, so `(https://en.wikipedia.org/wiki/Foo_(bar))` yields
 *   `https://en.wikipedia.org/wiki/Foo_(bar)`.
 */

export type UrlHit = {
  url: string;
  /** Index of the first URL character in the line text. */
  startCol: number;
  /** Exclusive index one past the last URL character. */
  endCol: number;
};

const URL_RE = /https?:\/\/[^\s"'<>]+/g;

/** Requires at least one character after the scheme's `//`. */
const HAS_HOST_RE = /^https?:\/\/./;

const TRAILING_PUNCT = new Set([".", ",", ":", ";", "!", "?"]);

const CLOSER_TO_OPENER: Readonly<Record<string, string>> = {
  ")": "(",
  "]": "[",
};

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n++;
  return n;
}

/** Strip trailing prose punctuation and unbalanced closers. */
function trimTrailing(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.charAt(url.length - 1);
    if (TRAILING_PUNCT.has(last)) {
      url = url.slice(0, -1);
      continue;
    }
    const opener = CLOSER_TO_OPENER[last];
    if (opener !== undefined && countChar(url, opener) < countChar(url, last)) {
      url = url.slice(0, -1);
      continue;
    }
    return url;
  }
}

/**
 * The http(s) URL in `lineText` whose character range contains `col`
 * (start inclusive, end exclusive), or null. Trimmed trailing
 * punctuation does not count as part of the URL.
 */
export function findUrlAt(lineText: string, col: number): UrlHit | null {
  for (const match of lineText.matchAll(URL_RE)) {
    const startCol = match.index ?? 0;
    if (col < startCol) return null; // matches are ordered left-to-right
    const url = trimTrailing(match[0]);
    if (!HAS_HOST_RE.test(url)) continue;
    const endCol = startCol + url.length;
    if (col < endCol) return { url, startCol, endCol };
  }
  return null;
}
