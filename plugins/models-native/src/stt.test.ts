import { describe, expect, it } from "vitest";
import {
  DEFAULT_STT_PROVIDER,
  STT_PROVIDER_LABELS,
  WHISPERCPP_DEFAULT_BASE_URL,
} from "./stt";

describe("STT provider labels", () => {
  it("labels every supported provider with non-empty text", () => {
    expect(Object.keys(STT_PROVIDER_LABELS).sort()).toEqual([
      "groq",
      "openai",
      "whispercpp",
    ]);
    for (const label of Object.values(STT_PROVIDER_LABELS)) {
      expect(label.trim()).not.toBe("");
    }
  });

  it("marks the whispercpp option as local", () => {
    expect(STT_PROVIDER_LABELS.whispercpp).toContain("local");
  });
});

describe("DEFAULT_STT_PROVIDER", () => {
  it("is a labelled provider", () => {
    expect(DEFAULT_STT_PROVIDER).toBe("openai");
    expect(STT_PROVIDER_LABELS[DEFAULT_STT_PROVIDER]).toBeTruthy();
  });
});

describe("WHISPERCPP_DEFAULT_BASE_URL", () => {
  it("points at loopback over plain http", () => {
    const url = new URL(WHISPERCPP_DEFAULT_BASE_URL);
    expect(url.protocol).toBe("http:");
    expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  });

  it("locks the frozen default value", () => {
    expect(WHISPERCPP_DEFAULT_BASE_URL).toBe("http://127.0.0.1:8080");
  });
});
