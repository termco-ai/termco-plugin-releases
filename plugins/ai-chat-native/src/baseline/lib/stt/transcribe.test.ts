import type { AiSpeechCapability } from "@termco/ai-inference-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureSpeechCapability,
  speechConfiguration,
  transcribeAudio,
} from "./transcribe";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("chat speech adapter", () => {
  it("delegates recorded bytes and media type through ai.speech", async () => {
    const transcribe = vi.fn(async () => "provider transcript");
    dispose = configureSpeechCapability({
      configuration: async () => ({ configuredProviders: ["openai"] }),
      transcribe,
    } satisfies AiSpeechCapability);

    await expect(
      transcribeAudio(
        new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }),
        "openai",
      ),
    ).resolves.toBe("provider transcript");
    expect(transcribe).toHaveBeenCalledWith({
      provider: "openai",
      audio: new Uint8Array([1, 2, 3]),
      mimeType: "audio/ogg",
    });
    await expect(speechConfiguration()).resolves.toEqual({
      configuredProviders: ["openai"],
    });
  });

  it("does not retain a replaced provider after cleanup", async () => {
    dispose = configureSpeechCapability({
      configuration: async () => ({ configuredProviders: [] }),
      transcribe: async () => "unused",
    });
    dispose();
    dispose = null;

    await expect(
      transcribeAudio(new Blob(["voice"]), "whispercpp"),
    ).rejects.toThrow("AI speech provider is not active");
  });
});
