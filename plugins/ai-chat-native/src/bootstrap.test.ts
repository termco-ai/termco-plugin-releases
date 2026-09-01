import { describe, expect, it, vi } from "vitest";
import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { bootstrapSessions } from "./bootstrap";
import { useChatStore } from "./store/store";

describe("AI session bootstrap", () => {
  it("hydrates credentials, selected model, and sessions in the provider", async () => {
    const initial = useChatStore.getInitialState();
    useChatStore.setState(initial, true);
    const hydrateSessions = vi.fn(async () => {});
    useChatStore.setState({ hydrateSessions });
    const listeners = new Map<string, (payload: unknown) => void>();
    const preferences = {
      get: vi.fn(async (key: string) =>
        key === "defaultModelId" ? "model-a" : [],
      ),
    } as unknown as PreferencesCapability;
    const inference = {
      configuration: vi.fn(async () => ({
        configuredProviderIds: ["openai"],
        configuredCustomEndpointIds: [],
      })),
    } as unknown as AiInferenceCapability;
    const events = {
      subscribe: vi.fn((event: string, listener: (payload: unknown) => void) => {
        listeners.set(event, listener);
        return () => listeners.delete(event);
      }),
    } as unknown as ApplicationEventsCapability;
    const models = [
      {
        id: "openai",
        keyRequirement: "required",
        keyringAccount: "openai-api-key",
      } as AiModelProviderCapability,
    ];

    const dispose = await bootstrapSessions({
      preferences,
      inference,
      events,
      models,
    });

    expect(hydrateSessions).toHaveBeenCalledOnce();
    expect(useChatStore.getState()).toMatchObject({
      selectedModelId: "model-a",
      keysLoaded: true,
      apiKeys: { openai: "configured" },
    });
    expect(listeners.has("termco://ai-keys-changed")).toBe(true);
    dispose();
    expect(listeners.size).toBe(0);
  });

  it("reloads provider configuration and preferences through application events", async () => {
    useChatStore.setState(useChatStore.getInitialState(), true);
    useChatStore.setState({ hydrateSessions: vi.fn(async () => {}) });
    const listeners = new Map<string, (payload: unknown) => void>();
    let defaultModelId = "model-a";
    let configuredProviderIds = ["openai"];
    let configuredCustomEndpointIds = ["endpoint-a"];
    const preferences = {
      get: vi.fn(async (key: string) =>
        key === "defaultModelId" ? defaultModelId : [],
      ),
    } as unknown as PreferencesCapability;
    const inference = {
      configuration: vi.fn(async () => ({
        configuredProviderIds,
        configuredCustomEndpointIds,
      })),
    } as unknown as AiInferenceCapability;
    const events = {
      subscribe: vi.fn((event: string, listener: (payload: unknown) => void) => {
        listeners.set(event, listener);
        return () => listeners.delete(event);
      }),
    } as unknown as ApplicationEventsCapability;
    const models = ["openai", "groq", "ollama"].map(
      (id) =>
        ({
          id,
          keyRequirement: "required",
          keyringAccount: `${id}-api-key`,
        }) as AiModelProviderCapability,
    );

    const dispose = await bootstrapSessions({
      preferences,
      inference,
      events,
      models,
    });

    configuredProviderIds = ["groq"];
    configuredCustomEndpointIds = ["endpoint-b"];
    listeners.get("termco://ai-keys-changed")?.(undefined);
    await vi.waitFor(() => {
      expect(useChatStore.getState()).toMatchObject({
        apiKeys: { openai: null, groq: "configured" },
        customEndpointKeys: { "endpoint-b": "configured" },
      });
    });

    defaultModelId = "model-b";
    listeners.get("termco://prefs-changed")?.({ key: "defaultModelId" });
    await vi.waitFor(() => {
      expect(useChatStore.getState().selectedModelId).toBe("model-b");
    });

    configuredProviderIds = ["ollama"];
    configuredCustomEndpointIds = [];
    listeners.get("termco://prefs-changed")?.({ key: "ollamaModelId" });
    await vi.waitFor(() => {
      expect(useChatStore.getState()).toMatchObject({
        apiKeys: { openai: null, groq: null, ollama: "configured" },
        customEndpointKeys: {},
      });
    });

    dispose();
    expect(listeners.size).toBe(0);
  });
});
