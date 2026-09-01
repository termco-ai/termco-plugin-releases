import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { describe, expect, it, vi } from "vitest";
import {
  createCapabilityFetch,
  resolveInferenceConfiguration,
  resolveModelConfiguration,
} from "./model";

const providers: AiModelProviderCapability[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyringAccount: "openai-key",
    keyPrefix: null,
    consoleUrl: "",
    keyRequirement: "required",
    kind: "cloud",
    description: "",
    models: [{
      id: "gpt-test", provider: "openai", label: "GPT", hint: "",
      description: "", capabilities: { intelligence: 3, speed: 3, cost: 3 },
    }],
  },
  {
    id: "openai-compatible",
    label: "Compatible",
    keyringAccount: "compatible-key",
    keyPrefix: null,
    consoleUrl: "",
    keyRequirement: "optional",
    kind: "compatible",
    description: "",
    models: [],
    customEndpoint: {
      modelIdPrefix: "compat-",
      keyringAccountPrefix: "compat-",
      keyringAccountSuffix: "-api-key",
      modelIdFor: (id) => `compat-${id}`,
      endpointIdFrom: (id) => id.startsWith("compat-") ? id.slice(7) : null,
      modelFor: (endpoint) => ({
        id: `compat-${endpoint.id}`,
        provider: "openai-compatible",
        label: endpoint.modelId,
        hint: endpoint.name,
        description: endpoint.baseURL,
        capabilities: { intelligence: 3, speed: 3, cost: 3 },
      }),
    },
  },
];

const localProvider: AiModelProviderCapability = {
  id: "ollama",
  label: "Ollama",
  keyringAccount: "",
  keyPrefix: null,
  consoleUrl: "",
  keyRequirement: "none",
  kind: "local",
  description: "",
  models: [{
    id: "ollama-local", provider: "ollama", label: "Ollama", hint: "",
    description: "", capabilities: { intelligence: 3, speed: 3, cost: 3 },
  }],
};

function capabilities(values: Record<string, unknown>, secrets: Record<string, string>): {
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
} {
  return {
    preferences: {
      get: async (key) => values[key] as never,
      getMany: async () => values,
      set: async () => {},
      delete: async () => false,
      subscribe: () => () => {},
    },
    secrets: {
      get: vi.fn(async (_service, account) => secrets[account] ?? null),
      set: async () => {}, delete: async () => {}, getAll: async () => [],
    },
  };
}

describe("AI inference model resolution", () => {
  it("does not report a local provider as configured without a model", async () => {
    const deps = capabilities({ ollamaModelId: "" }, {});

    await expect(resolveInferenceConfiguration({
      providers: [localProvider],
      ...deps,
    })).resolves.toEqual({
      configuredProviderIds: [],
      configuredCustomEndpointIds: [],
    });
  });

  it("reports a local provider as configured after a model is selected", async () => {
    const deps = capabilities({ ollamaModelId: "qwen3:8b" }, {});

    await expect(resolveInferenceConfiguration({
      providers: [localProvider],
      ...deps,
    })).resolves.toEqual({
      configuredProviderIds: ["ollama"],
      configuredCustomEndpointIds: [],
    });
  });

  it("resolves catalog models and credentials through public capabilities", async () => {
    const deps = capabilities({}, { "openai-key": "secret" });
    await expect(resolveModelConfiguration({ modelId: "gpt-test", providers, ...deps }))
      .resolves.toMatchObject({ modelId: "gpt-test", credential: "secret", allowPrivateNetwork: false });
  });

  it("resolves custom endpoint ids, URLs, model ids, and endpoint credentials", async () => {
    const deps = capabilities({
      customEndpoints: [{ id: "corp", name: "Corp", baseURL: "http://127.0.0.1:9000/v1", modelId: "company-model" }],
    }, { "compat-corp-api-key": "endpoint-secret" });
    await expect(resolveModelConfiguration({ modelId: "compat-corp", providers, ...deps }))
      .resolves.toMatchObject({
        provider: { id: "openai-compatible" },
        modelId: "company-model",
        baseURL: "http://127.0.0.1:9000/v1",
        credential: "endpoint-secret",
        allowPrivateNetwork: true,
      });
  });

  it("explains missing required credentials", async () => {
    const deps = capabilities({}, {});
    await expect(resolveModelConfiguration({ modelId: "gpt-test", providers, ...deps }))
      .rejects.toThrow("No API key configured for OpenAI");
  });

  it("routes provider fetches through the selected protected HTTP capability", async () => {
    const dispose = vi.fn(async () => {});
    const stream = vi.fn(async (_input, emit) => {
      emit({ kind: "headers", status: 201, headers: { "content-type": "text/plain" } });
      emit({ kind: "chunk", bytes: [...new TextEncoder().encode("created")] });
      emit({ kind: "end" });
      return dispose;
    }) satisfies HttpCapability["stream"];
    const http: HttpCapability = {
      ping: async () => 0,
      request: vi.fn(),
      stream,
    };
    const response = await createCapabilityFetch(http, true)("http://127.0.0.1:9000/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(await response.text()).toBe("created");
    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        allowPrivateNetwork: true,
        body: expect.any(Uint8Array),
      }),
      expect.any(Function),
    );
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
  });

  it("delivers chunks incrementally and cancels the protected HTTP stream", async () => {
    let emit!: Parameters<HttpCapability["stream"]>[1];
    const dispose = vi.fn(async () => {});
    const stream = vi.fn(async (_input, listener) => {
      emit = listener;
      return dispose;
    }) satisfies HttpCapability["stream"];
    const http: HttpCapability = {
      ping: async () => 0,
      request: vi.fn(),
      stream,
    };
    const abort = new AbortController();
    const responsePromise = createCapabilityFetch(http, true)(
      "http://127.0.0.1:9000/v1/chat",
      { signal: abort.signal },
    );
    await vi.waitFor(() => expect(stream).toHaveBeenCalledOnce());
    emit({ kind: "headers", status: 200, headers: { "content-type": "text/event-stream" } });
    const response = await responsePromise;
    const reader = response.body!.getReader();
    emit({ kind: "chunk", bytes: [...new TextEncoder().encode("first")] });
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(Array.from(first.value ?? [])).toEqual([
      ...new TextEncoder().encode("first"),
    ]);

    abort.abort(new DOMException("user stopped", "AbortError"));

    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    await expect(reader.read()).rejects.toThrow("user stopped");
  });
});
