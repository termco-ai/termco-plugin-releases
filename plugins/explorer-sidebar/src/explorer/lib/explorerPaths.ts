/**
 * Small path-label helpers local to the explorer container (header label and
 * context-menu "new file/folder" parent resolution).
 */

/** Last path segment (across `/` or `\`), falling back to the whole string. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

/** Parent directory of `path`, or `fallback` when it has no meaningful parent. */
export function parentOf(path: string, fallback: string): string {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : fallback;
}
