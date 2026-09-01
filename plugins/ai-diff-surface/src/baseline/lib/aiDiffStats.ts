/**
 * Added/removed line counting for the AI diff pane.
 *
 * Derives an insertion/deletion tally from a CodeMirror `presentableDiff`
 * between the original and proposed file contents.
 */
import { presentableDiff } from "@codemirror/merge";

/** Count the lines touched by the diff between `original` and `proposed`. */
export function computeLineStats(
  original: string,
  proposed: string,
): { added: number; removed: number } {
  const changes = presentableDiff(original, proposed);
  let added = 0;
  let removed = 0;
  for (const c of changes) {
    removed += countLines(original, c.fromA, c.toA);
    added += countLines(proposed, c.fromB, c.toB);
  }
  return { added, removed };
}

function countLines(doc: string, from: number, to: number): number {
  if (from === to) return 0;
  const slice = doc.slice(from, to);
  // A change spanning N newlines touches N+1 lines, but a trailing newline
  // means the final segment is empty — don't count that as a touched line.
  let n = 1;
  for (let i = 0; i < slice.length; i++) {
    if (slice.charCodeAt(i) === 10) n++;
  }
  if (slice.endsWith("\n")) n--;
  return Math.max(n, 1);
}
