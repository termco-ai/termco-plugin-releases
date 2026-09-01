/**
 * Tuning constants for inline autocomplete: debounce timing, trigger
 * thresholds, output caps, and the prefix/suffix context windows.
 *
 * Isolated so the driver, trigger gate, and text-shaping helpers share one
 * source of truth for these magic numbers.
 */

/** Idle delay before firing a completion after a normal keystroke. */
export const DEBOUNCE_MS = 350;
/** Short delay used to chain the next suggestion right after an accept. */
export const CHAIN_DELAY_MS = 80;
/** Minimum non-whitespace chars in the recent prefix before auto-triggering. */
export const MIN_PREFIX_CHARS = 2;
/** Hard cap on the number of lines a suggestion may span. */
export const MAX_LINES = 6;
/** Number of recent suggestions to keep in the per-editor LRU cache. */
export const CACHE_SIZE = 32;
/** Prefix bytes hashed into the cache key (from the tail of the prefix). */
export const CACHE_TAIL = 512;
/** Suffix bytes hashed into the cache key (from the head of the suffix). */
export const CACHE_HEAD = 128;
/** Characters of context sent before the cursor. */
export const PREFIX_WINDOW = 4000;
/** Characters of context sent after the cursor. */
export const SUFFIX_WINDOW = 2000;
