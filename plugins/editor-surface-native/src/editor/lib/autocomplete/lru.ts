/**
 * A minimal insertion-ordered LRU cache backed by a `Map`.
 *
 * Used to memoise recent completions per editor so repeated positions don't
 * re-hit the model. `get` promotes an entry to most-recently-used; `set` evicts
 * the oldest key once `cap` is exceeded.
 */
export class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly cap: number) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.cap) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
  clear() {
    this.map.clear();
  }
}
