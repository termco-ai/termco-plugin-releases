// Tiny path helpers for rendering search hits. Kept separate from the
// workspace/fs layer since the palette only needs display-level splitting.

/**
 * Return the final path segment of a relative path, tolerating both `/` and
 * `\\` separators. Falls back to the input when it has no separator.
 */
export function basename(rel: string): string {
  const parts = rel.split(/[\\/]/);
  return parts[parts.length - 1] || rel;
}
