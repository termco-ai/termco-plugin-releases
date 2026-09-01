import type {
  AiModelProviderCapability,
  AiProviderId,
} from "@termco/ai-models-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import type { LanguageModel } from "ai";

const KEYRING_SERVICE = "termco-ai";
const PREFERENCE_KEYS = [
  "lmstudioBaseURL",
  "lmstudioModelId",
  "mlxBaseURL",
  "mlxModelId",
  "ollamaBaseURL",
  "ollamaModelId",
  "openrouterModelId",
  "customEndpoints",
] as const;

export async function resolveInferenceConfiguration(input: {
  providers: readonly AiModelProviderCapability[];
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
}): Promise<{
  configuredProviderIds: string[];
  configuredCustomEndpointIds: string[];
}> {
  const values = await input.preferences.getMany([...PREFERENCE_KEYS]);
  const configuredProviderIds: string[] = [];
  for (const provider of input.providers) {
    if (provider.keyRequirement === "none") {
      const modelId = provider.id === "lmstudio"
        ? stringValue(values.lmstudioModelId)
        : provider.id === "mlx"
          ? stringValue(values.mlxModelId)
          : provider.id === "ollama"
            ? stringValue(values.ollamaModelId)
            : "";
      if (modelId) configuredProviderIds.push(provider.id);
      continue;
    }
    if (!provider.keyringAccount) continue;
    const credential = await input.secrets.get(KEYRING_SERVICE, provider.keyringAccount);
    const hasRequiredModel = provider.id !== "openrouter" || Boolean(
      stringValue(values.openrouterModelId),
    );
    if (credential && hasRequiredModel) {
      configuredProviderIds.push(provider.id);
    }
  }
  const compatible = input.providers.find(
    (provider) => provider.id === "openai-compatible",
  );
  const convention = compatible?.customEndpoint;
  const configuredCustomEndpointIds: string[] = [];
  for (const endpoint of endpoints(values.customEndpoints)) {
    if (!stringValue(endpoint.baseURL) || !stringValue(endpoint.modelId)) continue;
    const account = `${convention?.keyringAccountPrefix ?? "compat-"}${endpoint.id}${convention?.keyringAccountSuffix ?? "-api-key"}`;
    if (
      compatible?.keyRequirement !== "required" ||
      (await input.secrets.get(KEYRING_SERVICE, account))
    ) {
      configuredCustomEndpointIds.push(endpoint.id);
    }
  }
  return { configuredProviderIds, configuredCustomEndpointIds };
}

export interface CustomEndpoint {
  id: string;
  name?: string;
  baseURL: string;
  modelId: string;
}

export interface ResolvedModelConfiguration {
  provider: AiModelProviderCapability;
  modelId: string;
  baseURL?: string;
  credential?: string;
  allowPrivateNetwork: boolean;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function endpoints(value: unknown): CustomEndpoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CustomEndpoint => Boolean(
    item &&
    typeof item === "object" &&
    typeof (item as CustomEndpoint).id === "string" &&
    typeof (item as CustomEndpoint).baseURL === "string" &&
    typeof (item as CustomEndpoint).modelId === "string",
  ));
}

function requiredValue(value: unknown, message: string): string {
  const result = stringValue(value);
  if (!result) throw new Error(message);
  return result;
}

export async function resolveModelConfiguration(input: {
  modelId: string;
  providers: readonly AiModelProviderCapability[];
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
}): Promise<ResolvedModelConfiguration> {
  const values = await input.preferences.getMany([...PREFERENCE_KEYS]);
  const compatible = input.providers.find((provider) => provider.id === "openai-compatible");
  const convention = compatible?.customEndpoint;
  const prefix = convention?.modelIdPrefix ?? "compat-";

  let provider: AiModelProviderCapability | undefined;
  let modelId = input.modelId;
  let baseURL: string | undefined;
  let credentialAccount: string | undefined;

  if (input.modelId.startsWith(prefix)) {
    const endpointId = input.modelId.slice(prefix.length);
    const endpoint = endpoints(values.customEndpoints).find((entry) => entry.id === endpointId);
    if (!endpoint) throw new Error(`Custom endpoint not found: ${endpointId}`);
    provider = compatible;
    modelId = requiredValue(endpoint.modelId, `${endpoint.name || "Custom endpoint"}: no model id set. Open Settings → Models.`);
    baseURL = requiredValue(endpoint.baseURL, `${endpoint.name || "Custom endpoint"}: no base URL set. Open Settings → Models.`);
    credentialAccount = `${convention?.keyringAccountPrefix ?? "compat-"}${endpointId}${convention?.keyringAccountSuffix ?? "-api-key"}`;
  } else {
    provider = input.providers.find((candidate) => candidate.models.some((model) => model.id === input.modelId));
    if (!provider) throw new Error(`Unknown model: ${input.modelId}`);
    switch (input.modelId) {
      case "lmstudio-local":
        modelId = requiredValue(values.lmstudioModelId, "LM Studio: no model id set. Open Settings → Models.");
        baseURL = stringValue(values.lmstudioBaseURL) || provider.defaultBaseUrl;
        break;
      case "mlx-local":
        modelId = requiredValue(values.mlxModelId, "MLX: no model id set. Open Settings → Models.");
        baseURL = stringValue(values.mlxBaseURL) || provider.defaultBaseUrl;
        break;
      case "ollama-local":
        modelId = requiredValue(values.ollamaModelId, "Ollama: no model id set. Open Settings → Models.");
        baseURL = stringValue(values.ollamaBaseURL) || provider.defaultBaseUrl;
        break;
      case "openrouter-custom":
        modelId = requiredValue(values.openrouterModelId, "OpenRouter: no model id set. Open Settings → Models.");
        break;
    }
    credentialAccount = provider.keyringAccount || undefined;
  }

  if (!provider) throw new Error("OpenAI-compatible model provider is unavailable");
  if ((provider.kind === "local" || provider.id === "openai-compatible") && !baseURL) {
    baseURL = provider.defaultBaseUrl;
  }
  const credential = credentialAccount
    ? await input.secrets.get(KEYRING_SERVICE, credentialAccount)
    : null;
  if (provider.keyRequirement === "required" && !credential) {
    throw new Error(`No API key configured for ${provider.label}. Open Settings → Models to add one.`);
  }
  return {
    provider,
    modelId,
    ...(baseURL ? { baseURL } : {}),
    ...(credential ? { credential } : {}),
    allowPrivateNetwork: provider.kind === "local" || provider.id === "openai-compatible",
  };
}

export function createCapabilityFetch(
  http: HttpCapability,
  allowPrivateNetwork: boolean,
): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : new Uint8Array(await request.arrayBuffer());
    return await new Promise<Response>((resolve, reject) => {
      let responseController: ReadableStreamDefaultController<Uint8Array> | null = null;
      let dispose: (() => Promise<void>) | null = null;
      let cleanupRequested = false;
      let responseStarted = false;
      let terminal = false;

      const cleanup = async () => {
        cleanupRequested = true;
        if (dispose) await dispose();
      };
      const detachAbort = () => request.signal.removeEventListener("abort", abort);
      const fail = (error: unknown) => {
        if (terminal) return;
        terminal = true;
        detachAbort();
        const reason = error instanceof Error ? error : new Error(String(error));
        if (responseStarted) responseController?.error(reason);
        else reject(reason);
        void cleanup();
      };
      const abort = () => fail(
        request.signal.reason ?? new DOMException("HTTP request cancelled", "AbortError"),
      );
      if (request.signal.aborted) {
        abort();
        return;
      }
      request.signal.addEventListener("abort", abort, { once: true });

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          responseController = controller;
        },
        async cancel() {
          terminal = true;
          detachAbort();
          await cleanup();
        },
      });

      void http.stream({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        ...(body ? { body } : {}),
        allowPrivateNetwork,
      }, (event) => {
        if (terminal) return;
        switch (event.kind) {
          case "headers":
            responseStarted = true;
            resolve(new Response(stream, {
              status: event.status,
              headers: event.headers,
            }));
            break;
          case "chunk":
            if (!responseStarted) {
              fail(new Error("HTTP stream emitted bytes before headers"));
              return;
            }
            responseController?.enqueue(Uint8Array.from(event.bytes));
            break;
          case "end":
            terminal = true;
            detachAbort();
            if (!responseStarted) {
              reject(new Error("HTTP stream ended before headers"));
            } else {
              responseController?.close();
            }
            void cleanup();
            break;
          case "error":
            fail(new Error(event.message));
            break;
        }
      }).then((stop) => {
        dispose = stop;
        if (cleanupRequested) void dispose();
      }, fail);
    });
  };
}

const modelCache = new Map<string, LanguageModel>();

export async function buildLanguageModel(
  config: ResolvedModelConfiguration,
  http: HttpCapability,
): Promise<LanguageModel> {
  const key = JSON.stringify([
    config.provider.id,
    config.modelId,
    config.baseURL ?? "",
    config.credential ?? "",
  ]);
  const cached = modelCache.get(key);
  if (cached) return cached;
  const fetch = createCapabilityFetch(http, config.allowPrivateNetwork);
  const apiKey = config.credential ?? "";
  let model: LanguageModel;

  switch (config.provider.id) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      model = createOpenAI({ apiKey, fetch })(config.modelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      model = createAnthropic({ apiKey, fetch })(config.modelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      model = createGoogleGenerativeAI({ apiKey, fetch })(config.modelId);
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      model = createXai({ apiKey, fetch })(config.modelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      model = createCerebras({ apiKey, fetch })(config.modelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      model = createGroq({ apiKey, fetch })(config.modelId);
      break;
    }
    default: {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const compatible = {
        deepseek: { name: "deepseek", baseURL: "https://api.deepseek.com" },
        mistral: { name: "mistral", baseURL: "https://api.mistral.ai/v1" },
        openrouter: { name: "openrouter", baseURL: "https://openrouter.ai/api/v1" },
        "openai-compatible": { name: "openai-compatible", baseURL: config.baseURL ?? "" },
        lmstudio: { name: "lmstudio", baseURL: config.baseURL ?? "" },
        mlx: { name: "mlx", baseURL: config.baseURL ?? "" },
        ollama: { name: "ollama", baseURL: config.baseURL ?? "" },
      } satisfies Partial<Record<AiProviderId, { name: string; baseURL: string }>>;
      const selected = compatible[config.provider.id];
      if (!selected?.baseURL) throw new Error(`${config.provider.label}: no base URL configured`);
      model = createOpenAICompatible({
        ...selected,
        apiKey: apiKey || undefined,
        fetch,
        ...(config.provider.id === "openrouter" ? {
          headers: { "HTTP-Referer": "https://termco.app", "X-Title": "Termco" },
        } : {}),
      })(config.modelId);
      break;
    }
  }
  modelCache.set(key, model);
  return model;
}
