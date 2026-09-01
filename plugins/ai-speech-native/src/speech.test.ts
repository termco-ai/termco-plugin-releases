import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { describe, expect, it, vi } from "vitest";
import { createSpeechCapability } from "./speech";

const models = [
  { id: "openai", keyringAccount: "openai-api-key" },
  { id: "groq", keyringAccount: "groq-api-key" },
] as AiModelProviderCapability[];

function dependencies(keys: Record<string, string | null> = {}) {
  const request = vi.fn(async () => ({ status: 200, headers: {}, body: Array.from(new TextEncoder().encode("spoken")) }));
  return {
    request,
    value: createSpeechCapability({
      models,
      preferences: { get: async () => undefined } as unknown as PreferencesCapability,
      secrets: { get: async (_service: string, account: string) => keys[account] ?? null } as unknown as SecretsCapability,
      http: { request } as unknown as HttpCapability,
    }),
  };
}

describe("AI speech provider", () => {
  it("reports configuration without exposing credentials", async () => {
    const { value } = dependencies({ "openai-api-key": "secret" });
    await expect(value.configuration()).resolves.toEqual({
      configuredProviders: ["whispercpp", "openai"],
    });
  });

  it("owns authenticated multipart transcription", async () => {
    const { value, request } = dependencies({ "groq-api-key": "secret" });
    await expect(value.transcribe({
      provider: "groq",
      audio: Uint8Array.from([1, 2, 3]),
      mimeType: "audio/webm",
    })).resolves.toBe("spoken");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      timeoutMs: 30_000,
    }));
  });

  it("rejects missing cloud credentials before sending audio", async () => {
    const { value, request } = dependencies();
    await expect(value.transcribe({
      provider: "openai",
      audio: new Uint8Array(),
      mimeType: "audio/webm",
    })).rejects.toThrow("not configured");
    expect(request).not.toHaveBeenCalled();
  });
});
