/**
 * Closing the gap between our count and the provider's.
 *
 * We tokenize everything with o200k_base, which is exact for OpenAI and
 * systematically off elsewhere — Anthropic runs perhaps 10-20 % higher, more on
 * code-heavy content. Rather than pretend otherwise, every completed request
 * tells us the truth (`usage.inputTokens`) about a prompt we just estimated.
 * The ratio of those two is a correction factor, smoothed with an EMA so one
 * odd request cannot swing it.
 *
 * The seeded defaults matter more than they look: without them the very first
 * request of a session — before any usage has been reported — would be counted
 * with a factor of 1.0 and therefore wrong for exactly the provider where it is
 * most wrong.
 *
 * Deliberately in-memory. A stale factor from last week is worth less than one
 * learned from the conversation actually running, and it converges within a
 * couple of turns anyway.
 */

/** How much each new observation moves the factor. */
const EMA_ALPHA = 0.3;
/** Beyond this, something else is wrong and the "correction" would be damage. */
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.8;

/** Starting points per provider family, from observed drift against o200k_base. */
const SEEDS: ReadonlyArray<[RegExp, number]> = [
  [/claude|anthropic/i, 1.15],
  [/gemini|google/i, 1.1],
];

const factors = new Map<string, number>();

function seedFor(modelId: string): number {
  for (const [re, v] of SEEDS) if (re.test(modelId)) return v;
  return 1;
}

function bucket(modelId?: string): string {
  return (modelId ?? "").trim() || "default";
}

/** The multiplier to apply to a text-token estimate for this model. */
export function calibrationFactor(modelId?: string): number {
  const key = bucket(modelId);
  const known = factors.get(key);
  if (known !== undefined) return known;
  const seed = seedFor(key);
  factors.set(key, seed);
  return seed;
}

/**
 * Record what a request really cost against what we predicted.
 *
 * `estimated` must be the count for the SAME payload the provider billed —
 * history plus system prompt plus tool schemas. Feeding it a partial estimate
 * teaches the factor to over-correct, and it will happily do so.
 */
export function recordUsage(
  modelId: string | undefined,
  reported: number,
  estimated: number,
): void {
  if (!(reported > 0) || !(estimated > 0)) return;
  const key = bucket(modelId);
  const observed = reported / estimated;
  const prev = calibrationFactor(key);
  const next = prev * (1 - EMA_ALPHA) + observed * EMA_ALPHA;
  factors.set(key, Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, next)));
}

/** Test seam. */
export function __resetCalibration(): void {
  factors.clear();
}
