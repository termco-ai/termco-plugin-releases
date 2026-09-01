import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_ID,
  KEYRING_SERVICE,
  MAX_AGENT_STEPS,
  TERMINAL_BUFFER_LINES,
} from "./constants";
import { getModel, isKnownModelId } from "./models";

describe("KEYRING_SERVICE", () => {
  it("stays the frozen keychain service name", () => {
    // Changing this value orphans every stored API key.
    expect(KEYRING_SERVICE).toBe("termco-ai");
  });
});

describe("MAX_AGENT_STEPS", () => {
  it("is a positive integer step cap", () => {
    expect(Number.isInteger(MAX_AGENT_STEPS)).toBe(true);
    expect(MAX_AGENT_STEPS).toBeGreaterThan(0);
  });
});

describe("TERMINAL_BUFFER_LINES", () => {
  it("matches the documented 300-line scrollback budget", () => {
    expect(TERMINAL_BUFFER_LINES).toBe(300);
  });
});

describe("DEFAULT_MODEL_ID", () => {
  it("stays the frozen persisted default", () => {
    // Persisted in user prefs; renaming it breaks existing installs.
    expect(DEFAULT_MODEL_ID).toBe("gpt-5.4-mini");
  });

  it("refers to a registered model", () => {
    expect(isKnownModelId(DEFAULT_MODEL_ID)).toBe(true);
    expect(getModel(DEFAULT_MODEL_ID).id).toBe(DEFAULT_MODEL_ID);
  });
});
