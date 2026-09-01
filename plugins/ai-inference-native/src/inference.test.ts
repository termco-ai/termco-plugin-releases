import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(async () => ({ text: "completion", steps: [] })),
  streamText: vi.fn(() => ({ stream: "provider-stream" })),
  resolveModelConfiguration: vi.fn(async () => ({ provider: { id: "openai" } })),
  buildLanguageModel: vi.fn(async () => "selected-model"),
}));

vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: mocks.generateText,
  streamText: mocks.streamText,
}));
vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model")>()),
  resolveModelConfiguration: mocks.resolveModelConfiguration,
  buildLanguageModel: mocks.buildLanguageModel,
}));

import { adaptInferenceTools, createInferenceCapability } from "./inference";

describe("AI inference tool policy", () => {
  it("accepts executable read-only public tool definitions", () => {
    expect(adaptInferenceTools({
      read_file: {
        description: "Read",
        inputSchema: { type: "object" },
        execute: async () => ({ ok: true }),
      },
    })).toHaveProperty("read_file");
  });

  it("rejects interactive and approval-gated tools outside a session UI", () => {
    expect(() => adaptInferenceTools({
      ask_ui: { inputSchema: { type: "object" } },
    })).toThrow("interactive");
    expect(() => adaptInferenceTools({
      write_file: {
        inputSchema: { type: "object" },
        execute: async () => ({ ok: true }),
        needsApproval: true,
      },
    })).toThrow("requires approval");
  });
});

describe("AI inference streaming", () => {
  it("owns model construction and the provider SDK stream invocation", async () => {
    const inference = createInferenceCapability({
      providers: [],
      preferences: {} as never,
      secrets: {} as never,
      http: {} as never,
    });
    const abort = new AbortController();
    await expect(inference.stream({
      modelId: "gpt-test",
      instructions: "system",
      messages: [{ role: "user", content: "hello" }],
      tools: {},
      maxSteps: 7,
      chunkTimeoutMs: 1234,
      abortSignal: abort.signal,
    })).resolves.toEqual({ stream: "provider-stream" });
    expect(mocks.resolveModelConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "gpt-test" }),
    );
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      model: "selected-model",
      instructions: "system",
      messages: [{ role: "user", content: "hello" }],
      timeout: { chunkMs: 1234 },
      abortSignal: abort.signal,
    }));
  });

  it("translates normalized reasoning effort inside the selected provider", async () => {
    mocks.resolveModelConfiguration.mockResolvedValueOnce({
      provider: { id: "google" },
    });
    const inference = createInferenceCapability({
      providers: [],
      preferences: {} as never,
      secrets: {} as never,
      http: {} as never,
    });
    await inference.stream({
      modelId: "gemini-test",
      messages: [],
      tools: {},
      maxSteps: 1,
      reasoningEffort: "high",
      providerOptions: { google: { safetySettings: ["keep"] } },
    });
    expect(mocks.streamText).toHaveBeenLastCalledWith(expect.objectContaining({
      reasoning: "high",
      providerOptions: {
        google: {
          safetySettings: ["keep"],
          thinkingConfig: { includeThoughts: true },
        },
      },
    }));
  });

  it("does not enable residual thinking output when reasoning is off", async () => {
    mocks.resolveModelConfiguration.mockResolvedValueOnce({
      provider: { id: "google" },
    });
    const inference = createInferenceCapability({
      providers: [],
      preferences: {} as never,
      secrets: {} as never,
      http: {} as never,
    });
    await inference.stream({
      modelId: "gemini-test",
      messages: [],
      tools: {},
      maxSteps: 1,
      reasoningEffort: "off",
    });
    expect(mocks.streamText).toHaveBeenLastCalledWith(expect.objectContaining({
      reasoning: "none",
      providerOptions: {},
    }));
  });
});

describe("AI inference generation", () => {
  it("owns bounded output controls and preserves an empty provider result", async () => {
    const inference = createInferenceCapability({
      providers: [],
      preferences: {} as never,
      secrets: {} as never,
      http: {} as never,
    });
    const abort = new AbortController();
    await inference.generate({
      modelId: "gpt-test",
      instructions: "complete code",
      prompt: "prefix",
      maxSteps: 1,
      maxOutputTokens: 128,
      temperature: 0.2,
      providerOptions: { openai: { reasoningEffort: "low" } },
      totalTimeoutMs: 15_000,
      abortSignal: abort.signal,
    });
    expect(mocks.generateText).toHaveBeenCalledWith(expect.objectContaining({
      model: "selected-model",
      maxOutputTokens: 128,
      temperature: 0.2,
      providerOptions: { openai: { reasoningEffort: "low" } },
      timeout: { chunkMs: 90_000, totalMs: 15_000 },
      abortSignal: abort.signal,
    }));

    mocks.generateText.mockResolvedValueOnce({ text: "", steps: [] });
    await expect(inference.generate({
      modelId: "gpt-test",
      instructions: "complete code",
      prompt: "prefix",
      maxSteps: 1,
    })).resolves.toMatchObject({ text: "" });
  });
});
