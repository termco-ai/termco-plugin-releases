/**
 * A diff that does not care about indentation — VS Code's
 * `diffEditor.ignoreTrimWhitespace`, which is on by default there.
 *
 * The case that forced this: wrapping a block in one new element re-indents
 * every line inside it. A plain diff then marks the whole block as changed, and
 * the four lines that actually changed drown in it — "now it looks like
 * everything is a diff".
 *
 * ## Why not just filter the changes
 *
 * The obvious approach — run the built-in `diff()` and drop the changes that
 * are only whitespace — does not work. A `Change` is a range of CHARACTERS and
 * happily spans line boundaries, so "this change is only indentation" is not a
 * question you can ask of it.
 *
 * Instead we diff a trimmed copy and map the positions back:
 *
 *   1. trim every line, remembering where each one started in both texts
 *   2. run the library's own `presentableDiff` on the trimmed copies
 *   3. translate each change boundary back into original offsets
 *
 * Lines that differ only in indentation are *identical* once trimmed, so no
 * change is produced for them at all — they are ignored by construction rather
 * than by a filter that has to guess. Lines with a real edit still produce a
 * change, and because the library does the diffing, word-level highlighting
 * survives untouched.
 */

// `Change` is a class, not just a type — the mapped changes are constructed.
import { Change, presentableDiff } from "@codemirror/merge";

type LineEntry = {
  /** Offset of this line in the trimmed text. */
  trimStart: number;
  /** Length of the trimmed line. */
  trimLen: number;
  /** Offset of this line in the original text. */
  origStart: number;
  /** Characters trimmed off the FRONT of this line. */
  lead: number;
};

type LineMap = {
  trimmed: string;
  entries: LineEntry[];
};

/**
 * Trim each line, keeping a map back to the original offsets.
 *
 * Splitting on "\n" leaves a trailing "\r" on CRLF input, which `trim()` then
 * removes — so mixed line endings stop being a difference too, which is what
 * you want when the two sides come from different machines.
 */
function buildLineMap(text: string): LineMap {
  const lines = text.split("\n");
  const entries: LineEntry[] = [];
  const parts: string[] = [];
  let trim = 0;
  let orig = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lead = line.length - line.trimStart().length;
    entries.push({ trimStart: trim, trimLen: trimmed.length, origStart: orig, lead });
    parts.push(trimmed);
    // Every line but the last is followed by the newline we split on.
    const nl = i < lines.length - 1 ? 1 : 0;
    trim += trimmed.length + nl;
    orig += line.length + nl;
  }

  return { trimmed: parts.join("\n"), entries };
}

/** Index of the last line starting at or before `pos`. */
function lineAt(entries: LineEntry[], pos: number): number {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (entries[mid].trimStart <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Translate an offset in the trimmed text back to the original.
 *
 * Known imprecision, and the reason it is acceptable: a boundary that lands on
 * a character which was trimmed away maps to the start of that line's content.
 * That can shift a word-level highlight by the width of the indentation. It can
 * never change WHETHER a line counts as changed, which is the property this
 * whole module exists for.
 */
function toOriginal(map: LineMap, pos: number): number {
  if (!map.entries.length) return 0;
  const e = map.entries[lineAt(map.entries, pos)];
  const within = Math.min(Math.max(pos - e.trimStart, 0), e.trimLen);
  return e.origStart + e.lead + within;
}

/**
 * Drop-in for `@codemirror/merge`'s `diff`, ignoring pure indentation changes.
 *
 * Pass it as `diffConfig: { override: ignoreWhitespaceDiff }`.
 */
export function ignoreWhitespaceDiff(a: string, b: string): readonly Change[] {
  const mapA = buildLineMap(a);
  const mapB = buildLineMap(b);

  // Identical once trimmed: the two sides differ only in whitespace, so there
  // is nothing worth showing.
  if (mapA.trimmed === mapB.trimmed) return [];

  const changes = presentableDiff(mapA.trimmed, mapB.trimmed);
  const out: Change[] = [];
  for (const ch of changes) {
    const fromA = toOriginal(mapA, ch.fromA);
    const toA = Math.max(fromA, toOriginal(mapA, ch.toA));
    const fromB = toOriginal(mapB, ch.fromB);
    const toB = Math.max(fromB, toOriginal(mapB, ch.toB));
    // A change can collapse to nothing on both sides once the whitespace it
    // covered is gone — that is exactly a whitespace-only change.
    if (fromA === toA && fromB === toB) continue;
    out.push(new Change(fromA, toA, fromB, toB));
  }
  return out;
}
