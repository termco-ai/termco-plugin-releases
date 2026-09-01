import { describe, expect, it } from "vitest";
import {
  getModel,
  isKnownModelId,
  MODELS,
  type ModelInfo,
  type ModelTag,
  modelKeepsReasoning,
  resolveModel,
} from "./models";
import { PROVIDERS } from "./providers";

const VALID_TAGS: readonly ModelTag[] = [
  "vision",
  "reasoning",
  "tools",
  "coding",
];

describe("MODELS registry invariants", () => {
  it("has globally unique model ids", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("references only registered providers", () => {
    const providerIds = new Set(PROVIDERS.map((p) => p.id));
    for (const m of MODELS) {
      expect(providerIds.has(m.provider)).toBe(true);
    }
  });

  it("keeps capability scores within 1..5", () => {
    for (const m of MODELS) {
      for (const score of Object.values(m.capabilities)) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }
    }
  });

  it("fills label, hint, and description on every model", () => {
    for (const m of MODELS) {
      expect(m.label.trim()).not.toBe("");
      expect(m.hint.trim()).not.toBe("");
      expect(m.description.trim()).not.toBe("");
    }
  });

  it("only uses declared feature tags, without duplicates", () => {
    for (const m of MODELS as readonly ModelInfo[]) {
      const tags: readonly ModelTag[] = m.tags ?? [];
      expect(new Set(tags).size).toBe(tags.length);
      for (const t of tags) expect(VALID_TAGS).toContain(t);
    }
  });

  it("never marks a compat-prefixed id as a static model", () => {
    for (const m of MODELS) {
      expect(m.id.startsWith("compat-")).toBe(false);
    }
  });
});

describe("getModel", () => {
  it("returns the registry entry for a known id", () => {
    const m = getModel("claude-sonnet-5");
    expect(m.provider).toBe("anthropic");
    expect(m.label).toBe("Claude Sonnet 5");
  });
});

describe("isKnownModelId", () => {
  it("accepts every registered id", () => {
    for (const m of MODELS) expect(isKnownModelId(m.id)).toBe(true);
  });

  it("rejects unknown and compat ids", () => {
    expect(isKnownModelId("not-a-model")).toBe(false);
    expect(isKnownModelId("compat-abc")).toBe(false);
    expect(isKnownModelId("")).toBe(false);
  });
});

describe("modelKeepsReasoning", () => {
  it("keeps reasoning for freeform static models without the tag", () => {
    for (const id of [
      "openrouter-custom",
      "lmstudio-local",
      "mlx-local",
      "ollama-local",
    ] as const) {
      expect(modelKeepsReasoning(resolveModel(id))).toBe(true);
    }
  });

  it("keeps reasoning for tagged models on fixed providers", () => {
    expect(modelKeepsReasoning(getModel("deepseek-v4-pro"))).toBe(true);
    expect(modelKeepsReasoning(getModel("grok-4.20-reasoning"))).toBe(true);
  });

  // OpenAI is ALWAYS kept, tagged or not: the Responses API pairs each
  // replayed function_call item with its reasoning item and 400s when it's
  // missing (see modelKeepsReasoning).
  it("keeps reasoning for untagged OpenAI models", () => {
    expect(modelKeepsReasoning(getModel("gpt-5.3-codex"))).toBe(true);
  });

  it("drops reasoning for untagged models on other fixed providers", () => {
    expect(modelKeepsReasoning(getModel("claude-haiku-4-5"))).toBe(false);
  });
});
