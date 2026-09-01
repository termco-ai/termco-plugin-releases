/**
 * POSIX path arithmetic for the explorer's virtual file tree.
 *
 * `joinPath` is re-exported from the folder barrel and consumed outside the
 * module (source-control panel), so its behavior is a public contract.
 */

/** Join a parent directory and a child name with a single `/` separator. */
export function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

/** Return the parent directory of `path`, or `"/"` for top-level entries. */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}
