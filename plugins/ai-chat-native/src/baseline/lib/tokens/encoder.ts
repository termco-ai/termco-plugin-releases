/**
 * Counting tokens in a string, exactly when we can and honestly when we can't.
 *
 * ## Why `gpt-tokenizer`, and why only `o200k_base`
 *
 * The WASM tokenizers (`tiktoken`, `@anthropic-ai/tokenizer`) are out: the
 * production app loads over `file://` (`vite.config.ts` sets `base: "./"`), and
 * instantiating WASM by fetch against `file://` is exactly the class of
 * breakage you do not want in the send path. `@anthropic-ai/tokenizer` is wrong
 * for this purpose because its bundled vocabulary is obsolete for current
 * models.
 *
 * So: one pure-JS encoder, one encoding, for every provider. o200k_base is
 * exact for OpenAI and an approximation everywhere else (Anthropic runs ~10-20 %
 * higher, more on code). That residual error is not left to rot — it is what
 * `calibration.ts` corrects, using the provider's own reported usage.
 *
 * ## Why the cache
 *
 * The ladder runs on every send, over the whole history. Tool results and old
 * messages are immutable, so a warm cache turns "re-encode 800 KB" into "hash
 * 800 KB", which is roughly two orders of magnitude cheaper. Long strings are
 * chunked at line boundaries so a growing terminal buffer stays incremental
 * rather than re-encoding from scratch each turn.
 *
 * Measured on this machine: 840 KB of source encodes in ~22 ms cold. That is
 * why there is no worker here — it would be infrastructure for a cost that
 * turned out not to exist.
 */

import { djb2 } from "../hash";

type EncoderFn = (text: string) => number;

let encoder: EncoderFn | null = null;
let loading: Promise<void> | null = null;

/**
 * Characters per token before the real encoder is available.
 *
 * Measured against o200k_base rather than assumed, because the traditional
 * "chars / 4" is wrong for what we actually send:
 *
 *   repeated source code   2.33 chars/token
 *   JSON tool output       3.16
 *   English prose          4.50
 *
 * A history is mostly the first two, so 4 would under-count by a third — and
 * under-counting is the direction that ends in a rejected request. 3.0 sits
 * between code and JSON: it errs toward compacting slightly early, which costs
 * nothing, rather than slightly late, which costs a round trip.
 */
const HEURISTIC_CHARS_PER_TOKEN = 3.0;

/** Strings above this are split before encoding, so the cache can work per chunk. */
const CHUNK_THRESHOLD = 512 * 1024;
const CHUNK_TARGET = 32 * 1024;

/** Entries, not bytes — the values are numbers. */
const CACHE_CAPACITY = 4000;
const cache = new Map<string, number>();

function cacheGet(key: string): number | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  // Re-insert to mark as recently used; Map preserves insertion order.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: number): void {
  if (cache.size >= CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/**
 * Load the encoder. Idempotent, concurrent-safe, and never throws — a failed
 * load leaves the heuristic in place rather than breaking the send.
 */
export async function ensureTokenizer(): Promise<void> {
  if (encoder || loading) return loading ?? undefined;
  loading = (async () => {
    try {
      const mod = await import("gpt-tokenizer/encoding/o200k_base");
      encoder = (text: string) => mod.countTokens(text);
    } catch (err) {
      // Worth a line in the console: everything still works, just less exactly,
      // and a silent downgrade to guessing is hard to notice from the outside.
      console.warn("[tokens] falling back to estimation:", err);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function tokenizerReady(): boolean {
  return encoder != null;
}

/** Test seam: inject a deterministic encoder, or `null` to restore the real one. */
export function __setEncoder(fn: EncoderFn | null): void {
  encoder = fn;
  cache.clear();
}

export function __clearTokenCache(): void {
  cache.clear();
}

function heuristic(text: string): number {
  return Math.ceil(text.length / HEURISTIC_CHARS_PER_TOKEN);
}

/** Split at line boundaries near `CHUNK_TARGET`, so each chunk caches on its own. */
function chunk(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < text.length) {
    let end = Math.min(at + CHUNK_TARGET, text.length);
    if (end < text.length) {
      const nl = text.indexOf("\n", end);
      // Only follow the newline if it is nearby; a minified file has none.
      if (nl !== -1 && nl - end < CHUNK_TARGET) end = nl + 1;
    }
    out.push(text.slice(at, end));
    at = end;
  }
  return out;
}

function countOne(text: string): number {
  if (!text) return 0;
  const enc = encoder;
  if (!enc) return heuristic(text);
  const key = `${text.length}:${djb2(text)}`;
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  let n: number;
  try {
    n = enc(text);
  } catch {
    // A pathological string should cost accuracy, not the request.
    n = heuristic(text);
  }
  cacheSet(key, n);
  return n;
}

/** Token count of a string. Synchronous by design — the ladder needs it inline. */
export function countText(text: string): number {
  if (!text) return 0;
  if (text.length <= CHUNK_THRESHOLD) return countOne(text);
  let n = 0;
  for (const part of chunk(text)) n += countOne(part);
  return n;
}
