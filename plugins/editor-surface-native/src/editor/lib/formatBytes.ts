/**
 * Human-readable byte-size formatting for editor file-size hints.
 */

/** Format a byte count as `B` / `KB` / `MB` with one decimal past 1 KiB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
