export const FAILURE_BREAKER_LIMIT = 3;
export const RAPID_REFILL_LIMIT = 3;
const RAPID_REFILL_TURNS = 3;
const BACKOFF_MS = [60_000, 300_000];

export type CompactionHealth = {
  consecutiveFailures: number;
  breakerOpen?: "failure" | "thrash";
  turnsSinceCompact: number;
  rapidRefills: number;
  nextAttemptAfter?: number;
};

export const IDLE_HEALTH: CompactionHealth = {
  consecutiveFailures: 0,
  turnsSinceCompact: 0,
  rapidRefills: 0,
};

export function onCompactionFailed(
  health: CompactionHealth | undefined,
  now: number,
): CompactionHealth {
  const previous = health ?? IDLE_HEALTH;
  const consecutiveFailures = previous.consecutiveFailures + 1;
  const backoff =
    BACKOFF_MS[
      Math.min(consecutiveFailures - 1, BACKOFF_MS.length - 1)
    ];
  return {
    ...previous,
    consecutiveFailures,
    nextAttemptAfter: now + backoff,
    breakerOpen:
      consecutiveFailures >= FAILURE_BREAKER_LIMIT
        ? "failure"
        : previous.breakerOpen,
  };
}

export function onCompactionSucceeded(
  health: CompactionHealth | undefined,
  _now: number,
): CompactionHealth {
  const previous = health ?? IDLE_HEALTH;
  const rapidRefills =
    previous.turnsSinceCompact > 0 &&
    previous.turnsSinceCompact < RAPID_REFILL_TURNS
      ? previous.rapidRefills + 1
      : 0;
  return {
    consecutiveFailures: 0,
    turnsSinceCompact: 0,
    rapidRefills,
    breakerOpen: rapidRefills >= RAPID_REFILL_LIMIT ? "thrash" : undefined,
  };
}

export function onTurnCompleted(
  health: CompactionHealth | undefined,
): CompactionHealth {
  const previous = health ?? IDLE_HEALTH;
  return {
    ...previous,
    turnsSinceCompact: previous.turnsSinceCompact + 1,
  };
}

export function onManualSuccess(): CompactionHealth {
  return { ...IDLE_HEALTH };
}

export function breakerVerdict(
  health: CompactionHealth | undefined,
  now: number,
):
  | { allowed: true }
  | {
      allowed: false;
      reason: "failure" | "thrash" | "backoff";
      message: string;
    } {
  if (!health) return { allowed: true };
  if (health.breakerOpen === "thrash") {
    return {
      allowed: false,
      reason: "thrash",
      message:
        "Automatic compaction is off for this chat: the context refilled to the limit within a few turns, three times in a row. Something being read is likely too large for the context window. Try reading it in smaller pieces, or start a new chat.",
    };
  }
  if (health.breakerOpen === "failure") {
    return {
      allowed: false,
      reason: "failure",
      message:
        "Automatic compaction is off for this chat — it failed three times in a row. Run /compact to try again, or start a new chat.",
    };
  }
  if (health.nextAttemptAfter && now < health.nextAttemptAfter) {
    return {
      allowed: false,
      reason: "backoff",
      message: "Compaction failed recently; waiting before trying again.",
    };
  }
  return { allowed: true };
}
