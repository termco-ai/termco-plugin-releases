import { describe, expect, it } from "vitest";
import {
  FREEFORM_PROVIDERS,
  getProvider,
  KEYLESS_PROVIDERS,
  PROVIDERS,
  type ProviderId,
  providerNeedsKey,
  providerSupportsKey,
} from "./providers";

describe("PROVIDERS registry invariants", () => {
  it("has unique ids and labels", () => {
    const ids = PROVIDERS.map((p) => p.id);
    const labels = PROVIDERS.map((p) => p.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every key-supporting provider a unique keyring account", () => {
    const accounts = PROVIDERS.filter((p) => providerSupportsKey(p.id)).map(
      (p) => p.keyringAccount,
    );
    for (const a of accounts) expect(a).not.toBe("");
    expect(new Set(accounts).size).toBe(accounts.length);
  });

  it("leaves keyless local providers without a keyring account", () => {
    for (const id of ["lmstudio", "mlx", "ollama"] as const) {
      expect(getProvider(id).keyringAccount).toBe("");
    }
  });

  it("uses https console URLs everywhere", () => {
    for (const p of PROVIDERS) {
      expect(p.consoleUrl).toMatch(/^https:\/\//);
    }
  });

  it("locks the key prefixes used for input validation", () => {
    expect(getProvider("openai").keyPrefix).toBe("sk-");
    expect(getProvider("anthropic").keyPrefix).toBe("sk-ant-");
    expect(getProvider("xai").keyPrefix).toBe("xai-");
    expect(getProvider("cerebras").keyPrefix).toBe("csk-");
    expect(getProvider("groq").keyPrefix).toBe("gsk_");
    expect(getProvider("deepseek").keyPrefix).toBe("sk-");
    expect(getProvider("openrouter").keyPrefix).toBe("sk-or-");
    expect(getProvider("google").keyPrefix).toBeNull();
    expect(getProvider("mistral").keyPrefix).toBeNull();
  });
});

describe("getProvider", () => {
  it("returns the registered entry by id", () => {
    expect(getProvider("groq").label).toBe("Groq");
  });

  it("throws for an unregistered id", () => {
    expect(() => getProvider("nope" as ProviderId)).toThrow(
      "Unknown provider: nope",
    );
  });
});

describe("providerNeedsKey", () => {
  it("requires a key for every cloud provider", () => {
    const cloud: ProviderId[] = [
      "openai",
      "anthropic",
      "google",
      "xai",
      "cerebras",
      "groq",
      "deepseek",
      "mistral",
      "openrouter",
    ];
    for (const id of cloud) expect(providerNeedsKey(id)).toBe(true);
  });

  it("never requires a key for keyless providers", () => {
    for (const id of KEYLESS_PROVIDERS) {
      expect(providerNeedsKey(id)).toBe(false);
    }
  });
});

describe("providerSupportsKey", () => {
  it("is true for key-requiring providers", () => {
    expect(providerSupportsKey("openai")).toBe(true);
    expect(providerSupportsKey("mistral")).toBe(true);
  });

  it("is true for key-optional openai-compatible", () => {
    expect(providerSupportsKey("openai-compatible")).toBe(true);
  });

  it("is false for purely local servers", () => {
    expect(providerSupportsKey("lmstudio")).toBe(false);
    expect(providerSupportsKey("mlx")).toBe(false);
    expect(providerSupportsKey("ollama")).toBe(false);
  });
});

describe("provider sets", () => {
  it("locks the keyless provider list", () => {
    expect([...KEYLESS_PROVIDERS].sort()).toEqual([
      "lmstudio",
      "mlx",
      "ollama",
      "openai-compatible",
    ]);
  });

  it("keeps every freeform provider registered", () => {
    for (const id of FREEFORM_PROVIDERS) {
      expect(PROVIDERS.some((p) => p.id === id)).toBe(true);
    }
  });

  it("treats every keyless provider as freeform", () => {
    for (const id of KEYLESS_PROVIDERS) {
      expect(FREEFORM_PROVIDERS.has(id)).toBe(true);
    }
  });
});
