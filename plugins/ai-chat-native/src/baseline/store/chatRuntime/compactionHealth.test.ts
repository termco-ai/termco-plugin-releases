import { describe, expect, it } from "vitest";
import {
  breakerVerdict,
  FAILURE_BREAKER_LIMIT,
  IDLE_HEALTH,
  onCompactionFailed,
  onCompactionSucceeded,
  onManualSuccess,
  onTurnCompleted,
  RAPID_REFILL_LIMIT,
} from "./compactionHealth";

const NOW = 1_000_000;

describe("compaction health", () => {
  it("backs off and opens after three consecutive failures", () => {
    let health = IDLE_HEALTH;
    health = onCompactionFailed(health, NOW);
    expect(breakerVerdict(health, NOW + 1_000)).toMatchObject({
      allowed: false,
      reason: "backoff",
    });
    for (let index = 1; index < FAILURE_BREAKER_LIMIT; index += 1) {
      health = onCompactionFailed(health, NOW);
    }
    expect(breakerVerdict(health, NOW + 10_000_000)).toMatchObject({
      allowed: false,
      reason: "failure",
    });
  });

  it("opens when successful compactions refill immediately three times", () => {
    let health = IDLE_HEALTH;
    for (let round = 0; round < RAPID_REFILL_LIMIT; round += 1) {
      health = onTurnCompleted(health);
      health = onCompactionSucceeded(health, NOW);
    }
    expect(breakerVerdict(health, NOW)).toMatchObject({
      allowed: false,
      reason: "thrash",
    });
  });

  it("lets a successful manual compaction reset the breaker", () => {
    expect(breakerVerdict(onManualSuccess(), NOW)).toEqual({ allowed: true });
  });
});
