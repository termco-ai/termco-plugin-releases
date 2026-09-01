import { describe, expect, it } from "vitest";
import { computeThresholds, contextLevel } from "./thresholds";

describe("compaction thresholds", () => {
  it("reproduces the established 200k-window thresholds", () => {
    expect(computeThresholds(200_000)).toMatchObject({
      effective: 180_000,
      compact: 167_000,
      warn: 147_000,
      blocked: 177_000,
      precomputeArm: 144_000,
    });
  });

  it.each([8_000, 16_000, 32_000, 64_000, 128_000])(
    "keeps thresholds ordered for a %i-token window",
    (window) => {
      const thresholds = computeThresholds(window);
      expect(thresholds.warn).toBeGreaterThan(0);
      expect(thresholds.compact).toBeGreaterThan(thresholds.warn);
      expect(thresholds.blocked).toBeGreaterThan(thresholds.compact);
      expect(thresholds.window).toBeGreaterThan(thresholds.blocked);
    },
  );

  it("allows an earlier preference but never a later unsafe threshold", () => {
    expect(
      computeThresholds(200_000, { userTriggerTokens: 100_000 }).compact,
    ).toBe(100_000);
    expect(
      computeThresholds(200_000, { userTriggerTokens: 195_000 }).compact,
    ).toBe(167_000);
  });

  it("classifies every boundary inclusively", () => {
    const thresholds = computeThresholds(200_000);
    expect(contextLevel(thresholds.warn, thresholds)).toBe("warn");
    expect(contextLevel(thresholds.compact, thresholds)).toBe("compact");
    expect(contextLevel(thresholds.blocked, thresholds)).toBe("blocked");
  });
});
