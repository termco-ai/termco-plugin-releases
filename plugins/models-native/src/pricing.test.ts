import { describe, expect, it } from "vitest";
import { isKnownModelId, MODELS } from "./models";
import {
  estimateCost,
  getModelContextLimit,
  MODEL_CONTEXT_LIMITS,
  MODEL_PRICING,
} from "./pricing";

describe("MODEL_CONTEXT_LIMITS invariants", () => {
  it("covers every registered model", () => {
    for (const m of MODELS) {
      expect(MODEL_CONTEXT_LIMITS[m.id]).toBeGreaterThan(0);
    }
  });

  it("only lists known model ids", () => {
    for (const id of Object.keys(MODEL_CONTEXT_LIMITS)) {
      expect(isKnownModelId(id)).toBe(true);
    }
  });
});

describe("getModelContextLimit", () => {
  it("falls back to 128K when the model id is undefined", () => {
    expect(getModelContextLimit(undefined)).toBe(128_000);
  });

  it("falls back to 128K for an unknown static id", () => {
    expect(getModelContextLimit("mystery-model")).toBe(128_000);
  });

  it("falls back to 128K for a compat id without an override", () => {
    expect(getModelContextLimit("compat-abc")).toBe(128_000);
  });

  it("ignores the override for regular static models", () => {
    expect(getModelContextLimit("gpt-5.5", 1)).toBe(1_050_000);
  });
});

describe("MODEL_PRICING invariants", () => {
  it("only lists known model ids", () => {
    for (const id of Object.keys(MODEL_PRICING)) {
      expect(isKnownModelId(id)).toBe(true);
    }
  });

  it("keeps all prices positive and cache reads cheaper than input", () => {
    for (const p of Object.values(MODEL_PRICING)) {
      expect(p.input).toBeGreaterThan(0);
      expect(p.output).toBeGreaterThan(0);
      if (p.cacheRead !== undefined) {
        expect(p.cacheRead).toBeGreaterThan(0);
        expect(p.cacheRead).toBeLessThan(p.input);
      }
    }
  });
});

describe("estimateCost", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    cachedInputTokens: 400_000,
  };

  it("returns null without a model id", () => {
    expect(estimateCost(undefined, usage)).toBeNull();
  });

  it("returns null for a model without pricing", () => {
    expect(estimateCost("lmstudio-local", usage)).toBeNull();
    expect(estimateCost("no-such-model", usage)).toBeNull();
  });

  it("splits input into fresh and cache-read portions", () => {
    // gpt-5.5: input 5, output 15, cacheRead 0.5 per 1M tokens.
    // fresh 600K * 5 + cached 400K * 0.5 + out 500K * 15 = 10.7 USD.
    expect(estimateCost("gpt-5.5", usage)).toBeCloseTo(10.7, 10);
  });

  it("bills cached tokens at input rate when cacheRead is absent", () => {
    // grok-4.20-reasoning: input 3, output 15, no cacheRead.
    expect(estimateCost("grok-4.20-reasoning", usage)).toBeCloseTo(
      (1_000_000 * 3 + 500_000 * 15) / 1_000_000,
      10,
    );
  });

  it("clamps fresh input at zero when cached exceeds input", () => {
    const cost = estimateCost("gpt-5.4-mini", {
      inputTokens: 100,
      outputTokens: 0,
      cachedInputTokens: 500,
    });
    // fresh clamps to 0; only 500 cached tokens at 0.04 per 1M.
    expect(cost).toBeCloseTo((500 * 0.04) / 1_000_000, 15);
  });

  it("returns 0 for zero usage", () => {
    expect(
      estimateCost("claude-opus-4-8", {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
      }),
    ).toBe(0);
  });
});
