import { describe, expect, it } from "vitest";
import { compatModelId, decodeState } from "./renderer";

describe("models settings state", () => {
  it("normalizes missing preferences without changing persisted identifiers", () => {
    const state = decodeState({ defaultModelId: "claude-sonnet-5", compactThresholdTokens: 120_000 });
    expect(state.defaultModelId).toBe("claude-sonnet-5");
    expect(state.compactThresholdTokens).toBe(120_000);
    expect(state.sttProvider).toBe("openai");
  });

  it("uses the current OpenAI-compatible endpoint selection id", () => {
    expect(compatModelId("team-api")).toBe("compat-team-api");
  });
});
