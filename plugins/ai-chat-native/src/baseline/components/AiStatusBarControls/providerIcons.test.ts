import { describe, expect, it } from "vitest";
import type { AiProviderId } from "@termco/ai-models-base";
import { PROVIDER_ICON } from "./providerIcons";

const PROVIDER_IDS: readonly AiProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "cerebras",
  "groq",
  "deepseek",
  "mistral",
  "openrouter",
  "openai-compatible",
  "lmstudio",
  "mlx",
  "ollama",
];

describe("PROVIDER_ICON", () => {
  it("has a defined glyph for every registered provider", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_ICON[id], `icon for ${id}`).toBeDefined();
    }
  });

  it("has no extra keys beyond the provider registry", () => {
    const providerIds = new Set(PROVIDER_IDS);
    for (const key of Object.keys(PROVIDER_ICON)) {
      expect(providerIds.has(key as AiProviderId)).toBe(true);
    }
  });

  it("maps distinct providers to hugeicons descriptors", () => {
    // Hugeicons free icons are array descriptors; guard the shape so a bad
    // import (e.g. undefined icon) fails loudly here instead of at render.
    for (const icon of Object.values(PROVIDER_ICON)) {
      expect(Array.isArray(icon)).toBe(true);
      expect(icon.length).toBeGreaterThan(0);
    }
  });
});
