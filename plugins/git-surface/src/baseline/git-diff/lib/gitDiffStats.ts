/** Added/removed line counting from a raw unified-diff patch string. */

/**
 * Count `+`/`-` lines in a unified diff `patch`, ignoring the `+++`/`---`
 * file headers. Used for the git diff pane's fallback (binary / large-file)
 * view, where no CodeMirror merge view is rendered.
 */
export function countDiffLines(patch: string): {
  added: number;
  removed: number;
} {
  let added = 0;
  let removed = 0;
  for (let i = 0; i < patch.length; i++) {
    if (i > 0 && patch.charCodeAt(i - 1) !== 10) continue;
    const c = patch.charCodeAt(i);
    if (c === 43 && patch.charCodeAt(i + 1) !== 43) added++;
    else if (c === 45 && patch.charCodeAt(i + 1) !== 45) removed++;
  }
  return { added, removed };
}
