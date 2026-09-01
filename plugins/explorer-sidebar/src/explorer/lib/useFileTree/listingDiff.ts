/**
 * Pure predicates used when reconciling a fresh directory listing against the
 * currently cached tree state.
 */

import type { DirEntry } from "./types";

/** True when `key` is `root` itself or a descendant path of `root`. */
export function isUnder(key: string, root: string): boolean {
  if (key === root) return true;
  // Roots that already end in "/" (the filesystem root, e.g. an ssh rig
  // homed at "/") must not double the separator — `"/boot".startsWith("//")`
  // would reject every descendant.
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return key.startsWith(prefix);
}

/**
 * Compare two directory listings for tree-relevant equality.
 *
 * mtime/size are ignored on purpose: the tree never renders them, so a watcher
 * refetch that only bumps mtime (saving a file) must not count as a change.
 */
export function sameDirListing(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].kind !== b[i].kind ||
      a[i].gitignored !== b[i].gitignored
    )
      return false;
  }
  return true;
}
