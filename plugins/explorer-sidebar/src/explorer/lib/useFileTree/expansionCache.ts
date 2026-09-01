/**
 * Per-root memory of which folders were expanded.
 *
 * A tiny LRU keyed by root path so that switching away from a workspace and
 * back restores the previously open folders instead of collapsing everything.
 */

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map<string, string[]>();

/**
 * Persist the expanded-folder set for `root`, evicting the least-recently-used
 * root once the cache exceeds {@link EXPANSION_CACHE_LIMIT} entries. An empty
 * set clears any stored value for `root`.
 */
export function rememberExpansion(root: string, expanded: Set<string>): void {
  expansionCache.delete(root);
  if (expanded.size > 0) expansionCache.set(root, [...expanded]);
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

/**
 * Return (and mark as most-recently-used) the remembered expansion for `root`,
 * or an empty array if none is stored.
 */
export function recallExpansion(root: string): string[] {
  const v = expansionCache.get(root);
  if (!v) return [];
  expansionCache.delete(root);
  expansionCache.set(root, v);
  return v;
}
