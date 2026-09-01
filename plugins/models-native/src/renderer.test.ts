import { describe, expect, it } from "vitest";
import { MODELS } from "./models";
import { MODEL_PROVIDERS } from "./renderer";

describe("models-native registry", () => {
  it("keeps the established provider order", () => {
    expect(MODEL_PROVIDERS.map((provider) => provider.id)).toEqual([
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
    ]);
  });

  it("publishes every model once under its owning provider", () => {
    expect(new Set(MODEL_PROVIDERS.map((provider) => provider.id)).size).toBe(13);
    const published = MODEL_PROVIDERS.flatMap((provider) => provider.models).map((model) => model.id);
    expect(published).toHaveLength(MODELS.length);
    expect(new Set(published)).toEqual(new Set(MODELS.map((model) => model.id)));
  });

  it("keeps secret and local connection policy in the provider plugin", () => {
    expect(MODEL_PROVIDERS.find((provider) => provider.id === "openai")?.keyRequirement).toBe("required");
    expect(MODEL_PROVIDERS.find((provider) => provider.id === "openai-compatible")?.keyRequirement).toBe("optional");
    expect(MODEL_PROVIDERS.find((provider) => provider.id === "ollama")?.keyRequirement).toBe("none");
    expect(MODEL_PROVIDERS.filter((provider) => provider.defaultModelId)).toEqual([
      expect.objectContaining({ id: "openai", defaultModelId: "gpt-5.4-mini" }),
    ]);
  });

  it("publishes derived reasoning support so consumers do not duplicate model policy", () => {
    const openAi = MODEL_PROVIDERS.find((provider) => provider.id === "openai");
    const anthropic = MODEL_PROVIDERS.find(
      (provider) => provider.id === "anthropic",
    );

    expect(
      openAi?.models.find((model) => model.id === "gpt-5.6")?.reasoning,
    ).toEqual({
      levels: ["minimal", "low", "medium", "high", "xhigh"],
      default: "medium",
    });
    expect(
      anthropic?.models.find((model) => model.id === "claude-fable-5")
        ?.reasoning,
    ).toEqual({
      levels: ["low", "medium", "high"],
      default: "off",
    });

    const compatible = MODEL_PROVIDERS.find(
      (provider) => provider.id === "openai-compatible",
    );
    expect(
      compatible?.customEndpoint?.modelFor({
        id: "local",
        name: "Local model",
        baseURL: "http://127.0.0.1:8080/v1",
        modelId: "custom-model",
        contextLimit: 32_000,
      }),
    ).toMatchObject({
      id: "compat-local",
      provider: "openai-compatible",
      contextWindow: 32_000,
      reasoning: {
        levels: ["low", "medium", "high"],
        default: "off",
      },
    });
  });
});
