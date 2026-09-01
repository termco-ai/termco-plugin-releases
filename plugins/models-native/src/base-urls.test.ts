import { describe, expect, it } from "vitest";
import {
  LMSTUDIO_DEFAULT_BASE_URL,
  MLX_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
} from "./base-urls";

describe("local server default base URLs", () => {
  it("locks the frozen default values", () => {
    expect(LMSTUDIO_DEFAULT_BASE_URL).toBe("http://localhost:1234/v1");
    expect(MLX_DEFAULT_BASE_URL).toBe("http://127.0.0.1:8080/v1");
    expect(OLLAMA_DEFAULT_BASE_URL).toBe("http://localhost:11434/v1");
  });

  it("points every local default at loopback, never a remote host", () => {
    for (const url of [
      LMSTUDIO_DEFAULT_BASE_URL,
      MLX_DEFAULT_BASE_URL,
      OLLAMA_DEFAULT_BASE_URL,
    ]) {
      const host = new URL(url).hostname;
      expect(["localhost", "127.0.0.1"]).toContain(host);
    }
  });

  it("uses the OpenAI-style /v1 path on every local default", () => {
    for (const url of [
      LMSTUDIO_DEFAULT_BASE_URL,
      MLX_DEFAULT_BASE_URL,
      OLLAMA_DEFAULT_BASE_URL,
    ]) {
      expect(new URL(url).pathname).toBe("/v1");
    }
  });

  it("has no implicit default for the generic compatible endpoint", () => {
    expect(OPENAI_COMPATIBLE_DEFAULT_BASE_URL).toBe("");
  });
});
