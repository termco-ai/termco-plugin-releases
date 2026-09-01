const RESERVED_OUTPUT_TOKENS = 20_000;
const COMPACT_HEADROOM = 13_000;
const WARN_HEADROOM = 20_000;
const BLOCKED_HEADROOM = 3_000;
const SMALL_WINDOW = 100_000;
const REFERENCE_WINDOW = 200_000;
const MIN_SCALE = 0.15;

export type ContextThresholds = {
  window: number;
  effective: number;
  compact: number;
  warn: number;
  blocked: number;
  precomputeArm: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeThresholds(
  window: number,
  options: { maxOutputTokens?: number; userTriggerTokens?: number } = {},
): ContextThresholds {
  const resolvedWindow =
    Number.isFinite(window) && window > 0 ? Math.floor(window) : 8_000;
  const scale = clamp(resolvedWindow / REFERENCE_WINDOW, MIN_SCALE, 1);
  const scaled = (headroom: number) =>
    Math.round(resolvedWindow < SMALL_WINDOW ? headroom * scale : headroom);
  const reserve = Math.min(
    options.maxOutputTokens ?? RESERVED_OUTPUT_TOKENS,
    scaled(RESERVED_OUTPUT_TOKENS),
  );
  const effective = resolvedWindow - reserve;
  let compact = effective - scaled(COMPACT_HEADROOM);
  if (options.userTriggerTokens && options.userTriggerTokens > 0) {
    compact = Math.min(compact, Math.round(options.userTriggerTokens));
  }
  let warn = compact - scaled(WARN_HEADROOM);
  let blocked = resolvedWindow - reserve - scaled(BLOCKED_HEADROOM);
  const floor = Math.max(1, Math.round(resolvedWindow * 0.02));
  blocked = clamp(blocked, floor + 2, resolvedWindow - 1);
  compact = clamp(compact, floor + 1, blocked - 1);
  warn = clamp(warn, floor, compact - 1);
  const precomputeArm = Math.min(
    effective - Math.round(effective * 0.2),
    compact,
  );
  return {
    window: resolvedWindow,
    effective,
    compact,
    warn,
    blocked,
    precomputeArm: clamp(precomputeArm, floor, compact),
  };
}

export function contextLevel(
  used: number,
  thresholds: ContextThresholds,
): "ok" | "warn" | "compact" | "blocked" {
  if (used >= thresholds.blocked) return "blocked";
  if (used >= thresholds.compact) return "compact";
  if (used >= thresholds.warn) return "warn";
  return "ok";
}
