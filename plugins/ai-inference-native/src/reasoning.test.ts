import { describe, expect, it } from "vitest";
import {
  mergeProviderOptions,
  reasoningLevel,
  reasoningProviderOptions,
} from "./reasoning";

describe("reasoning provider translation", () => {
  it("maps off to none and clamps openai-compatible providers", () => {
    expect(reasoningLevel("openai", "off")).toBe("none");
    expect(reasoningLevel("ollama", "minimal")).toBe("low");
    expect(reasoningLevel("openrouter", "xhigh")).toBe("high");
    expect(reasoningLevel("anthropic", "xhigh")).toBe("xhigh");
  });

  it("supplies only the provider options missing from SDK reasoning mapping", () => {
    expect(reasoningProviderOptions("google")).toEqual({
      google: { thinkingConfig: { includeThoughts: true } },
    });
    expect(reasoningProviderOptions("groq")).toEqual({
      groq: { reasoningFormat: "parsed" },
    });
    expect(reasoningProviderOptions("openai")).toEqual({});
  });

  it("merges residual options without losing consumer-owned options", () => {
    expect(mergeProviderOptions(
      { google: { safetySettings: ["keep"] }, openai: { store: false } },
      { google: { thinkingConfig: { includeThoughts: true } } },
    )).toEqual({
      google: {
        safetySettings: ["keep"],
        thinkingConfig: { includeThoughts: true },
      },
      openai: { store: false },
    });
  });
});
