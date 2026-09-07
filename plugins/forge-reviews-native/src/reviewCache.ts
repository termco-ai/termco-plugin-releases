/** Small LRU with expiry and a memory budget. Expiry also releases stale
 * entries when a different review is visited, rather than only on a hit. */
export function reviewCache<T>(options: {
  ttlMs: number;
  maxEntries: number;
  maxWeight?: number;
  weight?: (value: T) => number;
}) {
  const entries = new Map<string, { at: number; value: T; weight: number }>();
  let weight = 0;
  const remove = (key: string) => {
    weight -= entries.get(key)?.weight ?? 0;
    entries.delete(key);
  };
  const expire = () => {
    for (const [key, entry] of entries) {
      if (Date.now() - entry.at >= options.ttlMs) remove(key);
    }
  };
  return {
    get(key: string): { at: number; value: T } | undefined {
      expire();
      const entry = entries.get(key);
      if (entry) {
        entries.delete(key);
        entries.set(key, entry);
      }
      return entry;
    },
    set(key: string, entry: { at: number; value: T }): void {
      expire();
      remove(key);
      const size = options.weight?.(entry.value) ?? 1;
      const budget = options.maxWeight ?? Infinity;
      if (size > budget) return;
      while (
        entries.size &&
        (entries.size >= options.maxEntries || weight + size > budget)
      ) {
        remove(entries.keys().next().value!);
      }
      entries.set(key, { ...entry, weight: size });
      weight += size;
    },
    clear(): void {
      entries.clear();
      weight = 0;
    },
  };
}
