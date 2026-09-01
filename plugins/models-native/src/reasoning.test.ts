import { describe, expect, it } from "vitest";
import type { ModelInfo } from "./models";
import { effectiveEffort, getReasoningSupport } from "./reasoning";

const base = {
  label: "x",
  hint: "x",
  description: "x",
  capabilities: { intelligence: 3, speed: 3, cost: 3 },
} as const;

const model = (over: Partial<ModelInfo>): ModelInfo =>
  ({ id: "m", provider: "openai", ...base, ...over }) as ModelInfo;

describe("getReasoningSupport", () => {
  it("uses an explicit per-model override when present", () => {
    const m = model({
      tags: ["reasoning"],
      reasoning: { levels: ["low", "high"], default: "high" },
    });
    expect(getReasoningSupport(m)).toEqual({
      levels: ["low", "high"],
      default: "high",
    });
  });

  it("derives the provider baseline for a reasoning-tagged model", () => {
    const m = model({ provider: "anthropic", tags: ["reasoning"] });
    expect(getReasoningSupport(m)).toEqual({
      levels: ["low", "medium", "high"],
      default: "off",
    });
  });

  it("offers the OpenAI full range for a reasoning-tagged OpenAI model", () => {
    const m = model({ provider: "openai", tags: ["reasoning"] });
    expect(getReasoningSupport(m)?.levels).toContain("xhigh");
    expect(getReasoningSupport(m)?.default).toBe("medium");
  });

  it("returns the freeform base for a custom/local provider without tags", () => {
    const m = model({ provider: "lmstudio", tags: undefined });
    expect(getReasoningSupport(m)).toEqual({
      levels: ["low", "medium", "high"],
      default: "off",
    });
  });

  it("returns undefined for a non-reasoning model", () => {
    const m = model({ provider: "openai", tags: ["vision", "tools"] });
    expect(getReasoningSupport(m)).toBeUndefined();
  });
});

describe("effectiveEffort", () => {
  const reasoningModel = model({ provider: "openai", tags: ["reasoning"] });

  it("falls back to the model default when nothing is stored", () => {
    expect(effectiveEffort(reasoningModel, undefined)).toBe("medium");
  });

  it("honors a stored level that the model supports", () => {
    expect(effectiveEffort(reasoningModel, "high")).toBe("high");
    expect(effectiveEffort(reasoningModel, "off")).toBe("off");
  });

  it("ignores a stored level the model doesn't offer, using the default", () => {
    const anthropic = model({ provider: "anthropic", tags: ["reasoning"] });
    // Anthropic baseline has no "xhigh".
    expect(effectiveEffort(anthropic, "xhigh")).toBe("off");
  });

  it("is 'off' for a non-reasoning model regardless of stored value", () => {
    const plain = model({ provider: "openai", tags: ["tools"] });
    expect(effectiveEffort(plain, "high")).toBe("off");
  });
});
