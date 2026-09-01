/**
 * Pure text helpers for inline autocomplete: building the cache key and
 * trimming a raw model completion into displayable ghost text.
 */
import { CACHE_HEAD, CACHE_TAIL, MAX_LINES } from "./constants";

/**
 * Build a stable cache key from the prefix tail, suffix head, and language.
 * Bounding the hashed context keeps distant edits from busting the cache.
 */
export function suggestionKey(
  prefix: string,
  suffix: string,
  lang: string | null,
): string {
  const p = prefix.length > CACHE_TAIL ? prefix.slice(-CACHE_TAIL) : prefix;
  const s = suffix.length > CACHE_HEAD ? suffix.slice(0, CACHE_HEAD) : suffix;
  return `${lang ?? ""}${p} ${s}`;
}

/**
 * Clean a raw model response into ghost text: strip fences/markers, remove
 * prefix/suffix overlap, cap line count, drop already-typed indent, and add a
 * leading newline after an opening delimiter. Returns `""` if nothing usable.
 */
export function trimSuggestion(
  raw: string,
  prefix: string,
  suffix: string,
): string {
  if (!raw) return "";
  let t = raw;

  // Drop wrapping markdown fences if the model added them.
  const fence = t.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fence) t = fence[1];
  t = t.replace(/^<\|cursor\|>/, "");

  // Strip prefix-tail overlap: if PREFIX ends with a partial token "te" and
  // the model returned "test", drop the leading "te" so the ghost shows "st".
  const tailMatch = prefix.match(/[\w$]+$/);
  if (tailMatch) {
    const tail = tailMatch[0];
    for (let n = Math.min(tail.length, t.length); n > 0; n--) {
      if (t.slice(0, n) === tail.slice(tail.length - n)) {
        t = t.slice(n);
        break;
      }
    }
  }

  // Cap to a reasonable line count.
  const lines = t.split("\n");
  if (lines.length > MAX_LINES) t = lines.slice(0, MAX_LINES).join("\n");

  // Drop trailing overlap with suffix (model sometimes echoes what's ahead).
  const maxOverlap = Math.min(t.length, suffix.length);
  for (let n = maxOverlap; n > 0; n--) {
    if (t.slice(t.length - n) === suffix.slice(0, n)) {
      t = t.slice(0, t.length - n);
      break;
    }
  }

  // Strip leading indent that's already typed on the current line.
  const lastNl = prefix.lastIndexOf("\n");
  const lineSoFar = prefix.slice(lastNl + 1);
  if (
    lineSoFar.length > 0 &&
    /^\s+$/.test(lineSoFar) &&
    t.startsWith(lineSoFar)
  ) {
    t = t.slice(lineSoFar.length);
  }

  // If suggestion is just a duplicate of what's already typed on the line, skip.
  if (lineSoFar && t.trimStart() === lineSoFar.trimStart()) return "";

  t = t.replace(/\s+$/, "");

  // If PREFIX's last line ends with an opening delimiter (`{`, `[`, `(`, `=>`)
  // and the suggestion is a body (multi-line OR starts with indent), prepend
  // a newline so the body doesn't land on the same line as the brace.
  if (
    t &&
    !t.startsWith("\n") &&
    /(?:[{[(]|=>)\s*$/.test(lineSoFar) &&
    (t.includes("\n") || /^\s/.test(t))
  ) {
    t = "\n" + t;
  }

  return t;
}
