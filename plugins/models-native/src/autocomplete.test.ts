import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTOCOMPLETE_MODEL,
  getAutocompleteEligibleModels,
} from "./autocomplete";
import { isKnownModelId, MODELS, resolveModel } from "./models";
import type { ProviderId } from "./providers";

// Providers whose model id is typed in at runtime; their defaults are
// suggestions, not registry entries.
const FREEFORM: readonly ProviderId[] = [
  "openrouter",
  "openai-compatible",
  "lmstudio",
  "mlx",
  "ollama",
];

describe("DEFAULT_AUTOCOMPLETE_MODEL", () => {
  it("maps registry-backed providers to registered models they own", () => {
    for (const [provider, modelId] of Object.entries(
      DEFAULT_AUTOCOMPLETE_MODEL,
    )) {
      if (FREEFORM.includes(provider as ProviderId)) continue;
      expect(isKnownModelId(modelId)).toBe(true);
      expect(resolveModel(modelId).provider).toBe(provider);
    }
  });

  it("has no default for the generic openai-compatible provider", () => {
    expect(DEFAULT_AUTOCOMPLETE_MODEL["openai-compatible"]).toBe("");
  });
});

describe("getAutocompleteEligibleModels", () => {
  it("only returns models with speed 4 or higher", () => {
    const eligible = getAutocompleteEligibleModels();
    expect(eligible.length).toBeGreaterThan(0);
    for (const m of eligible) {
      expect(m.capabilities.speed).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps every registry-backed autocomplete default eligible", () => {
    const ids: string[] = getAutocompleteEligibleModels().map((m) => m.id);
    for (const [provider, modelId] of Object.entries(
      DEFAULT_AUTOCOMPLETE_MODEL,
    )) {
      if (FREEFORM.includes(provider as ProviderId)) continue;
      expect(ids).toContain(modelId);
    }
  });

  it("returns entries drawn from the registry", () => {
    const registryIds = new Set<string>(MODELS.map((m) => m.id));
    for (const m of getAutocompleteEligibleModels()) {
      expect(registryIds.has(m.id)).toBe(true);
    }
  });

  it("excludes slow flagships", () => {
    const ids = getAutocompleteEligibleModels().map((m) => m.id);
    expect(ids).not.toContain("gpt-5.5");
    expect(ids).not.toContain("claude-opus-4-8");
  });
});
