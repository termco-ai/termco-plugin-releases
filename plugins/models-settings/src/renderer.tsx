import type {
  AiModelDefinition,
  AiModelProviderCapability,
  AiModelRegistry,
  AiProviderId,
} from "@termco/ai-models-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { HttpCapability } from "@termco/http-base";
import type { PluginModule } from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import type {
  UiSettingsSectionContribution,
  UiSettingsSectionRegistry,
  UiSettingsViewCapability,
} from "@termco/ui-settings-base";
import ui from "@termco/ui";
import {
  Add01Icon,
  AiScanIcon,
  AppleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  ChatGptIcon,
  ClaudeIcon,
  CloudIcon,
  ComputerIcon,
  CpuIcon,
  DeepseekIcon,
  Delete02Icon,
  Edit02Icon,
  FlashIcon,
  GlobeIcon,
  GoogleGeminiIcon,
  Grok02Icon,
  MistralIcon,
  PlugIcon,
  Search01Icon,
  ServerStack01Icon,
  SquareLock02Icon,
  Tick02Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { UI_SETTINGS_SECTIONS_SERVICE } from "@termco/ui-settings-base";
import { UI_SETTINGS_VIEW_SERVICE } from "@termco/ui-settings-base";
import { AI_MODELS_SERVICE } from "@termco/ai-models-base";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { NETWORK_HTTP_SERVICE } from "@termco/http-base";
import {
  SECRETS_APPLICATION_SERVICE,
  SETTINGS_PREFERENCES_SERVICE,
} from "@termco/storage-base";
import { createModelsOnboardingContribution } from "./onboarding";

const { useEffect, useMemo, useState } = ui.React;
const KEYRING_SERVICE = "termco-ai";
const KEY_CHANGED_EVENT = "termco://ai-keys-changed";
const MODEL_REMOVED_EVENT = "termco://ai-model-removed";
const DEFAULT_MODEL_ID = "gpt-5.4-mini";
const ICON_BY_PROVIDER = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  google: GoogleGeminiIcon,
  xai: Grok02Icon,
  cerebras: CpuIcon,
  groq: FlashIcon,
  deepseek: DeepseekIcon,
  mistral: MistralIcon,
  openrouter: GlobeIcon,
  "openai-compatible": PlugIcon,
  lmstudio: ComputerIcon,
  mlx: AppleIcon,
  ollama: ServerStack01Icon,
} as const satisfies Record<AiProviderId, typeof ChatGptIcon>;
const PROVIDER_BLURB: Record<AiProviderId, string> = {
  openai: "GPT-5 and the o-series",
  anthropic: "Claude Opus, Sonnet, Haiku",
  google: "Gemini Pro & Flash",
  xai: "Grok",
  cerebras: "Wafer-scale hosted inference",
  groq: "Ultra-fast hosted inference",
  deepseek: "DeepSeek chat & reasoner",
  mistral: "Large & Codestral",
  openrouter: "One key, every model",
  "openai-compatible": "Any OpenAI-compatible endpoint",
  lmstudio: "Local inference server",
  mlx: "Apple-silicon inference",
  ollama: "Models on your machine",
};
const PREF_KEYS = [
  "defaultModelId", "autocompleteEnabled", "autocompleteProvider", "autocompleteModelId",
  "compactionModelId", "compactThresholdTokens", "sttProvider", "groqSttModel",
  "whispercppBaseURL", "lmstudioBaseURL", "lmstudioModelId", "mlxBaseURL",
  "mlxModelId", "ollamaBaseURL", "ollamaModelId", "openrouterModelId",
  "customEndpoints", "favoriteModelIds", "recentModelIds",
] as const;

type CustomEndpoint = {
  id: string;
  name: string;
  baseURL: string;
  modelId: string;
  contextLimit: number;
};

type SettingsState = {
  defaultModelId: string;
  autocompleteEnabled: boolean;
  autocompleteProvider: AiProviderId;
  autocompleteModelId: string;
  compactionModelId: string;
  compactThresholdTokens: number;
  sttProvider: "openai" | "groq" | "whispercpp";
  groqSttModel: string;
  whispercppBaseURL: string;
  lmstudioBaseURL: string;
  lmstudioModelId: string;
  mlxBaseURL: string;
  mlxModelId: string;
  ollamaBaseURL: string;
  ollamaModelId: string;
  openrouterModelId: string;
  customEndpoints: CustomEndpoint[];
  favoriteModelIds: string[];
  recentModelIds: string[];
};

const initial: SettingsState = {
  defaultModelId: DEFAULT_MODEL_ID,
  autocompleteEnabled: false,
  autocompleteProvider: "cerebras",
  autocompleteModelId: "gpt-oss-120b",
  compactionModelId: "",
  compactThresholdTokens: 0,
  sttProvider: "openai",
  groqSttModel: "whisper-large-v3-turbo",
  whispercppBaseURL: "http://127.0.0.1:8080",
  lmstudioBaseURL: "http://localhost:1234/v1",
  lmstudioModelId: "",
  mlxBaseURL: "http://127.0.0.1:8080/v1",
  mlxModelId: "",
  ollamaBaseURL: "http://localhost:11434/v1",
  ollamaModelId: "",
  openrouterModelId: "",
  customEndpoints: [],
  favoriteModelIds: [],
  recentModelIds: [],
};

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function endpointList(value: unknown): CustomEndpoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CustomEndpoint => Boolean(item && typeof item === "object" && typeof (item as CustomEndpoint).id === "string"));
}
export function compatModelId(id: string): string { return `compat-${id}`; }
export function normalizeEndpointContextLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1_000, Math.round(value))
    : 128_000;
}
export function normalizeDefaultModelId(
  value: unknown,
  fallback: string,
  validModelIds: ReadonlySet<string>,
): string {
  return typeof value === "string" && validModelIds.has(value)
    ? value
    : fallback;
}
export function filterKnownModelIds(
  value: unknown,
  validModelIds: ReadonlySet<string>,
): string[] {
  return stringList(value).filter((id) => validModelIds.has(id));
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function mask(value: string): string { return value.length <= 8 ? "•".repeat(value.length) : `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`; }

export function decodeState(
  values: Record<string, unknown>,
  defaults: SettingsState = initial,
  validModelIds?: ReadonlySet<string>,
): SettingsState {
  const provider = stringValue(values.autocompleteProvider, defaults.autocompleteProvider);
  const stt = stringValue(values.sttProvider, defaults.sttProvider);
  return {
    ...defaults,
    defaultModelId: validModelIds
      ? normalizeDefaultModelId(
          values.defaultModelId,
          defaults.defaultModelId,
          validModelIds,
        )
      : stringValue(values.defaultModelId, defaults.defaultModelId),
    autocompleteEnabled: values.autocompleteEnabled === true,
    autocompleteProvider: provider as AiProviderId,
    autocompleteModelId: stringValue(values.autocompleteModelId, defaults.autocompleteModelId),
    compactionModelId: stringValue(values.compactionModelId),
    compactThresholdTokens: typeof values.compactThresholdTokens === "number" ? values.compactThresholdTokens : 0,
    sttProvider: (stt === "groq" || stt === "whispercpp" ? stt : "openai"),
    groqSttModel: stringValue(values.groqSttModel, defaults.groqSttModel),
    whispercppBaseURL: stringValue(values.whispercppBaseURL, defaults.whispercppBaseURL),
    lmstudioBaseURL: stringValue(values.lmstudioBaseURL, defaults.lmstudioBaseURL),
    lmstudioModelId: stringValue(values.lmstudioModelId),
    mlxBaseURL: stringValue(values.mlxBaseURL, defaults.mlxBaseURL),
    mlxModelId: stringValue(values.mlxModelId),
    ollamaBaseURL: stringValue(values.ollamaBaseURL, defaults.ollamaBaseURL),
    ollamaModelId: stringValue(values.ollamaModelId),
    openrouterModelId: stringValue(values.openrouterModelId),
    customEndpoints: endpointList(values.customEndpoints),
    favoriteModelIds: validModelIds
      ? filterKnownModelIds(values.favoriteModelIds, validModelIds)
      : stringList(values.favoriteModelIds),
    recentModelIds: validModelIds
      ? filterKnownModelIds(values.recentModelIds, validModelIds)
      : stringList(values.recentModelIds),
  };
}

export function createModelsSettings(deps: {
  providers: readonly AiModelProviderCapability[];
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
  events: ApplicationEventsCapability;
  http: HttpCapability;
  desktop: DesktopIntegrationCapability;
}) {
  const endpointConvention = deps.providers.find((provider) => provider.id === "openai-compatible")?.customEndpoint;
  const providerDefault = (id: AiProviderId, fallback: string) => deps.providers.find((provider) => provider.id === id)?.defaultBaseUrl ?? fallback;
  const defaults: SettingsState = {
    ...initial,
    defaultModelId: deps.providers.find((provider) => provider.defaultModelId)?.defaultModelId ?? initial.defaultModelId,
    lmstudioBaseURL: providerDefault("lmstudio", initial.lmstudioBaseURL),
    mlxBaseURL: providerDefault("mlx", initial.mlxBaseURL),
    ollamaBaseURL: providerDefault("ollama", initial.ollamaBaseURL),
  };
  const endpointModelId = (id: string) => `${endpointConvention?.modelIdPrefix ?? "compat-"}${id}`;
  const endpointSecretAccount = (id: string) => `${endpointConvention?.keyringAccountPrefix ?? "compat-"}${id}${endpointConvention?.keyringAccountSuffix ?? "-api-key"}`;
  const validModelIds = (endpoints: readonly CustomEndpoint[]) => new Set([
    ...deps.providers.flatMap((provider) => provider.models.map((model) => model.id)),
    ...endpoints.map((endpoint) => endpointModelId(endpoint.id)),
  ]);
  const decode = (values: Record<string, unknown>) => {
    const endpoints = endpointList(values.customEndpoints);
    return decodeState(values, defaults, validModelIds(endpoints));
  };
  return function ModelsSettings() {
    const { providers, preferences, secrets, events, http, desktop } = deps;
    const [state, setState] = useState<SettingsState | null>(null);
    const [keys, setKeys] = useState<Record<string, string | null>>({});
    const [endpointKeys, setEndpointKeys] = useState<Record<string, string | null>>({});
    const [adding, setAdding] = useState<Set<AiProviderId>>(new Set());
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      const dispose = preferences.subscribe((key, value) => {
        if (!PREF_KEYS.includes(key as (typeof PREF_KEYS)[number])) return;
        setState((current) => current ? decode({ ...current, [key]: value }) : current);
      });
      void (async () => {
        try {
          const values = await preferences.getMany([...PREF_KEYS]);
          const loaded = decode(values);
          const secured = providers.filter((provider) => provider.keyRequirement !== "none");
          const accounts = secured.map((provider) => provider.keyringAccount).concat(loaded.customEndpoints.map((endpoint) => endpointSecretAccount(endpoint.id)));
          const found = await secrets.getAll(KEYRING_SERVICE, accounts);
          if (!active) return;
          setState(loaded);
          setKeys(Object.fromEntries(secured.map((provider, index) => [provider.id, found[index] ?? null])));
          setEndpointKeys(Object.fromEntries(loaded.customEndpoints.map((endpoint, index) => [endpoint.id, found[secured.length + index] ?? null])));
        } catch (cause) {
          if (active) setError(errorMessage(cause));
        }
      })();
      return () => { active = false; dispose(); };
    }, [preferences, providers, secrets]);

    const persist = async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      if (!state) return;
      const previous = state[key];
      setState((current) => current ? { ...current, [key]: value } : current);
      setError(null);
      try { await preferences.set(key, value); }
      catch (cause) { setState((current) => current ? { ...current, [key]: previous } : current); setError(errorMessage(cause)); }
    };
    const emitKeysChanged = async () => { await Promise.resolve(events.emit(KEY_CHANGED_EVENT, null)); };
    const saveProviderKey = async (provider: AiModelProviderCapability, value: string) => {
      try {
        const trimmed = value.trim();
        if (!trimmed) throw new Error("API key is empty");
        if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) throw new Error(`${provider.label} keys start with “${provider.keyPrefix}”.`);
        await secrets.set(KEYRING_SERVICE, provider.keyringAccount, trimmed);
        setKeys((current) => ({ ...current, [provider.id]: trimmed }));
        await emitKeysChanged();
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    };
    const clearProviderKey = async (provider: AiModelProviderCapability) => {
      await secrets.delete(KEYRING_SERVICE, provider.keyringAccount).catch(() => {});
      setKeys((current) => ({ ...current, [provider.id]: null }));
      await emitKeysChanged();
    };
    const saveEndpointKey = async (id: string, value: string) => {
      try {
        const trimmed = value.trim();
        if (!trimmed) throw new Error("API key is empty");
        await secrets.set(KEYRING_SERVICE, endpointSecretAccount(id), trimmed);
        setEndpointKeys((current) => ({ ...current, [id]: trimmed }));
        await emitKeysChanged();
        setError(null);
      } catch (cause) {
        setError(errorMessage(cause));
        throw cause;
      }
    };
    const clearEndpointKey = async (id: string) => {
      await secrets.delete(KEYRING_SERVICE, endpointSecretAccount(id)).catch(() => {});
      setEndpointKeys((current) => ({ ...current, [id]: null }));
      await emitKeysChanged();
    };

    if (!state) return <p className="text-xs text-muted-foreground">{error ? `Could not load model settings: ${error}` : "Loading model providers…"}</p>;

    const modelIdKey = (id: AiProviderId): keyof SettingsState | null => id === "lmstudio" ? "lmstudioModelId" : id === "mlx" ? "mlxModelId" : id === "ollama" ? "ollamaModelId" : id === "openrouter" ? "openrouterModelId" : null;
    const configured = (provider: AiModelProviderCapability): boolean => {
      if (provider.kind === "cloud") return Boolean(keys[provider.id]);
      const key = modelIdKey(provider.id);
      if (!key) return false;
      const hasModel = Boolean(String(state[key] ?? "").trim());
      return provider.id === "openrouter" ? hasModel && Boolean(keys.openrouter) : hasModel;
    };
    const configuredIds = new Set(providers.filter(configured).map((provider) => provider.id));
    if (state.customEndpoints.some((endpoint) => endpoint.baseURL.trim() && endpoint.modelId.trim())) configuredIds.add("openai-compatible");
    const allModels = providers.flatMap((provider) => provider.models);
    const endpointModels: AiModelDefinition[] = state.customEndpoints.filter((endpoint) => endpoint.baseURL.trim() && endpoint.modelId.trim()).map((endpoint) => ({
      id: endpointModelId(endpoint.id), provider: "openai-compatible", label: endpoint.modelId,
      hint: endpoint.name || "Custom", description: `${endpoint.name || "Custom endpoint"} — ${endpoint.baseURL}`,
      capabilities: { intelligence: 3, speed: 3, cost: 3 }, contextWindow: endpoint.contextLimit,
    }));
    const selectable = allModels.filter((model) => configuredIds.has(model.provider)).concat(endpointModels);
    const visible = providers.filter((provider) => provider.id !== "openai-compatible" && (configured(provider) || adding.has(provider.id)));
    const addable = providers.filter((provider) => provider.id !== "openai-compatible" && !visible.some((item) => item.id === provider.id));

    const removeProvider = async (provider: AiModelProviderCapability) => {
      if (provider.keyRequirement !== "none") await clearProviderKey(provider);
      const modelKey = modelIdKey(provider.id);
      if (modelKey) await persist(modelKey, "" as never);
      setAdding((current) => { const next = new Set(current); next.delete(provider.id); return next; });
    };
    const addEndpoint = async () => {
      const endpoint: CustomEndpoint = { id: crypto.randomUUID().slice(0, 8), name: "", baseURL: "", modelId: "", contextLimit: 128_000 };
      await persist("customEndpoints", [...state.customEndpoints, endpoint]);
      setCatalogOpen(false);
    };
    const updateEndpoint = async (id: string, patch: Partial<CustomEndpoint>) => {
      await persist("customEndpoints", state.customEndpoints.map((endpoint) => endpoint.id === id ? { ...endpoint, ...patch } : endpoint));
    };
    const removeEndpoint = async (id: string) => {
      const dead = endpointModelId(id);
      await clearEndpointKey(id);
      await persist("favoriteModelIds", state.favoriteModelIds.filter((model) => model !== dead));
      await persist("recentModelIds", state.recentModelIds.filter((model) => model !== dead));
      if (state.defaultModelId === dead) await persist("defaultModelId", defaults.defaultModelId);
      if (state.autocompleteModelId === dead) await persist("autocompleteModelId", "");
      if (state.compactionModelId === dead) await persist("compactionModelId", "");
      const remaining = state.customEndpoints.filter((endpoint) => endpoint.id !== id);
      await persist("customEndpoints", remaining);
      await Promise.resolve(events.emit(MODEL_REMOVED_EVENT, { modelId: dead, fallbackModelId: remaining[0] ? endpointModelId(remaining[0].id) : defaults.defaultModelId }));
    };

    const compactionModels = selectable.filter((model) => (model.contextWindow ?? 128_000) >= 100_000);
    return <div data-onboarding-target="models.overview" data-testid="models-settings-section" className="flex flex-col gap-[26px]">
      <Section title="Default assistant">
        <Row title="Model used for new chats" description="Pick from any provider you've connected below.">
          <div data-onboarding-target="models.default"><DefaultModelPicker value={state.defaultModelId} models={selectable} fallback={allModels} providers={providers} onChange={(value) => void persist("defaultModelId", value)} /></div>
        </Row>
        <Row title="Autocomplete" description={state.autocompleteEnabled && !configuredIds.has(state.autocompleteProvider)
          ? `${providers.find((provider) => provider.id === state.autocompleteProvider)?.label ?? state.autocompleteProvider} isn't connected — add it below.`
          : "Inline suggestions as you type in the editor."}>
          <div className="flex items-center gap-2">
            <ui.Switch checked={state.autocompleteEnabled} onCheckedChange={(value) => void persist("autocompleteEnabled", value)} />
            <ModelSelect
              disabled={!state.autocompleteEnabled}
              value={state.autocompleteModelId || allModels.find((model) => model.provider === state.autocompleteProvider)?.id || ""}
              models={allModels.filter((model) => model.capabilities.speed >= 4).concat(endpointModels)}
              fallback={allModels}
              isItemDisabled={(model) => model.provider !== "openai-compatible" && !configuredIds.has(model.provider)}
              onChange={(value) => {
                const model = allModels.concat(endpointModels).find((item) => item.id === value);
                if (!model) return;
                const provider = providers.find((item) => item.id === model.provider);
                void persist("autocompleteProvider", model.provider);
                void persist("autocompleteModelId", provider?.kind === "local" ? "" : value);
              }}
            />
          </div>
        </Row>
        <Row title="Model used to compact long chats" description="When a conversation outgrows the context window it gets summarised. A cheap model here saves a lot, because summarising re-reads the whole history.">
          <SelectControl value={state.compactionModelId || "__same__"} options={[
            { value: "__same__", label: "Same as the chat" },
            ...compactionModels.map((model) => ({ value: model.id, label: model.label })),
          ]} onChange={(value) => void persist("compactionModelId", value === "__same__" ? "" : value)} />
        </Row>
        <Row title="Compact automatically at" description="How large the conversation may get before it summarises itself into a fresh chat. Automatic follows the model's own window. A fixed number is always capped by that window.">
          <CompactThresholdControl value={state.compactThresholdTokens} onCommit={(value) => persist("compactThresholdTokens", value)} />
        </Row>
      </Section>

      <Section title="Voice input">
        <Row title="Transcription provider" description={state.sttProvider === "openai" ? "Uses your official OpenAI API key and the Whisper model." : state.sttProvider === "groq" ? "Uses your official Groq API key and Groq's Whisper endpoint." : "Connects to a local Whisper.cpp server for offline transcription."}>
          <SelectControl value={state.sttProvider} options={[
            { value: "openai", label: "OpenAI Whisper" },
            { value: "groq", label: "Groq Whisper" },
            { value: "whispercpp", label: "Whisper.cpp (local)" },
          ]} onChange={(value) => void persist("sttProvider", value as SettingsState["sttProvider"])} />
        </Row>
        {state.sttProvider === "groq" ? <Row title="Groq transcription model" description="The model ID sent to Groq’s transcription endpoint."><CommitInput ariaLabel="Groq transcription model" value={state.groqSttModel} placeholder="whisper-large-v3-turbo" onCommit={(value) => persist("groqSttModel", value)} /></Row> : null}
        {state.sttProvider === "whispercpp" ? <Row title="Whisper.cpp base URL" description="The local server used for offline transcription."><CommitInput ariaLabel="Whisper.cpp base URL" value={state.whispercppBaseURL} placeholder="http://127.0.0.1:8080" onCommit={(value) => persist("whispercppBaseURL", value)} /></Row> : null}
      </Section>

      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div className="termco-section-label">Model sources</div>
          <ui.Button data-onboarding-target="models.add-provider" type="button" size="sm" variant={catalogOpen ? "secondary" : "outline"} className="h-7 gap-1.5 rounded-md px-2.5 text-xs" aria-expanded={catalogOpen} onClick={() => setCatalogOpen((value) => !value)}><HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />{catalogOpen ? "Close catalogue" : "Add provider"}</ui.Button>
        </div>
        <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-3.5 py-3">
          <div><p className="text-xs font-semibold text-foreground">{configuredIds.size} connected source{configuredIds.size === 1 ? "" : "s"}</p><p className="mt-0.5 text-xs text-muted-foreground">Keys are stored in the OS keychain; local endpoints stay on this device.</p></div>
          <div className="hidden items-center -space-x-1.5 sm:flex">{visible.slice(0, 5).map((provider) => <span key={provider.id} className="grid size-7 place-items-center rounded-full border border-background bg-muted text-xs font-semibold text-muted-foreground" title={provider.label}>{provider.label.slice(0, 1)}</span>)}</div>
        </div>
        {catalogOpen ? <ProviderCatalogue providers={addable} onAdd={(id) => { setAdding((current) => new Set(current).add(id)); setCatalogOpen(false); }} onAddEndpoint={() => void addEndpoint()} /> : null}
        <div className="flex flex-col gap-2.5">
          {visible.map((provider) => <ProviderCard key={provider.id} provider={provider} keyValue={keys[provider.id] ?? null} state={state} http={http} desktop={desktop} onSaveKey={(value) => saveProviderKey(provider, value)} onRemove={() => void removeProvider(provider)} onPersist={persist} />)}
          {state.customEndpoints.map((endpoint) => <EndpointCard key={endpoint.id} endpoint={endpoint} keyValue={endpointKeys[endpoint.id] ?? null} http={http} onUpdate={(patch) => updateEndpoint(endpoint.id, patch)} onSaveKey={(value) => saveEndpointKey(endpoint.id, value)} onClearKey={() => clearEndpointKey(endpoint.id)} onRemove={() => void removeEndpoint(endpoint.id)} />)}
          {visible.length === 0 && state.customEndpoints.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center"><p className="text-sm text-foreground/80">No providers connected yet</p><p className="mt-1 text-xs text-muted-foreground">Add a cloud or local model source to start chatting.</p></div> : null}
        </div>
      </section>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>;
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><div className="termco-section-label mb-2">{title}</div><div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]">{children}</div></section>;
}
function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="flex items-center gap-4 border-t border-border px-4 py-(--settings-row-pad) first:border-t-0 hover:bg-accent/35"><div className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="font-medium text-sm">{title}</span><span className="max-w-[560px] text-xs leading-[1.5] text-muted-foreground">{description}</span></div><div className="flex shrink-0 items-center">{children}</div></div>;
}
function SelectControl({ value, options, disabled, onChange }: { value: string; options: Array<{ value: string; label: string; disabled?: boolean }>; disabled?: boolean; onChange(value: string): void }) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return <ui.DropdownMenu><ui.DropdownMenuTrigger asChild><ui.Button type="button" variant="outline" disabled={disabled} className="h-8 w-[230px] justify-between gap-2 rounded-md px-2.5 text-xs"><span className="truncate">{current?.label}</span><HugeiconsIcon icon={ArrowDown01Icon} size={11} strokeWidth={2} className="opacity-70" /></ui.Button></ui.DropdownMenuTrigger><ui.DropdownMenuContent align="start" collisionPadding={12} className="max-h-80 min-w-[230px] overflow-y-auto">{options.map((option) => <ui.DropdownMenuItem key={option.value} disabled={option.disabled} onSelect={() => onChange(option.value)} className={ui.cn("text-xs", option.value === value && "font-medium")}>{option.label}</ui.DropdownMenuItem>)}</ui.DropdownMenuContent></ui.DropdownMenu>;
}
function ModelSelect({ value, models, fallback, disabled, isItemDisabled, onChange }: { value: string; models: readonly AiModelDefinition[]; fallback: readonly AiModelDefinition[]; disabled?: boolean; isItemDisabled?(model: AiModelDefinition): boolean; onChange(value: string): void }) {
  const items = models.length ? models : fallback;
  const currentIncluded = items.some((model) => model.id === value);
  return <SelectControl disabled={disabled} value={currentIncluded ? value : "__select__"} options={[...(currentIncluded ? [] : [{ value: "__select__", label: "Select a model" }]), ...items.map((model) => ({ value: model.id, label: `${model.label} ${model.hint}`, disabled: isItemDisabled?.(model) }))]} onChange={onChange} />;
}

function DefaultModelPicker({ value, models, fallback, providers, onChange }: {
  value: string;
  models: readonly AiModelDefinition[];
  fallback: readonly AiModelDefinition[];
  providers: readonly AiModelProviderCapability[];
  onChange(value: string): void;
}) {
  const hasAny = models.length > 0;
  const current = models.find((model) => model.id === value) ?? fallback.find((model) => model.id === value) ?? models[0];
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [query, setQuery] = useState("");
  const availableProviders = providers.filter((item) => models.some((model) => model.provider === item.id));
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => (!provider || model.provider === provider) && (!needle || model.label.toLowerCase().includes(needle) || model.description.toLowerCase().includes(needle) || model.hint.toLowerCase().includes(needle)));
  }, [models, provider, query]);
  return <ui.Popover open={open} onOpenChange={setOpen}>
    <ui.PopoverTrigger asChild>
      <ui.Button type="button" variant="outline" disabled={!hasAny} className="h-9 w-[230px] justify-between gap-2 px-2.5 text-xs">
        <span className="flex min-w-0 items-center gap-2">{current ? <><HugeiconsIcon icon={ICON_BY_PROVIDER[current.provider]} size={14} strokeWidth={1.75} /><span className="truncate font-medium">{current.label}</span><span className="truncate text-muted-foreground">{current.hint}</span></> : <span>Select a model</span>}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={11} strokeWidth={2} className="shrink-0 opacity-70" />
      </ui.Button>
    </ui.PopoverTrigger>
    {hasAny ? <ui.PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={12} className="w-[min(34rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0">
      <div className="border-b border-border/70 px-3 py-2.5"><p className="text-xs font-semibold text-foreground">Default model</p><p className="mt-0.5 text-xs text-muted-foreground">New chats start here. You can still switch per conversation.</p></div>
      <div className="flex items-center gap-2 border-b border-border/70 p-2"><div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2.5"><HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={1.7} className="text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connected models" className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none" /></div></div>
      <div className="grid max-h-80 grid-cols-[8.5rem_minmax(0,1fr)]">
        <nav aria-label="Connected providers" className="overflow-y-auto border-r border-border/70 bg-muted/20 p-1.5">
          <ProviderFilter label="All models" active={provider === null} onClick={() => setProvider(null)} />
          {availableProviders.map((item) => <ProviderFilter key={item.id} provider={item.id} label={item.label} active={provider === item.id} onClick={() => setProvider(item.id)} />)}
        </nav>
        <div className="overflow-y-auto p-1.5">{filtered.map((model) => <button key={model.id} type="button" data-item onClick={() => { onChange(model.id); setOpen(false); }} className={ui.cn("flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors", model.id === value ? "border-primary/30 bg-[var(--signal-soft)]" : "border-transparent hover:border-border hover:bg-muted/35")}>
          <HugeiconsIcon icon={ICON_BY_PROVIDER[model.provider]} size={14} strokeWidth={1.75} /><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><span className="truncate">{model.label}</span><span className="rounded border border-border bg-background px-1 py-0.5 text-xs text-muted-foreground">{model.hint}</span></span><span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-muted-foreground">{model.description}</span></span>{model.id === value ? <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" /> : null}
        </button>)}</div>
      </div>
    </ui.PopoverContent> : null}
  </ui.Popover>;
}

function ProviderFilter({ provider, label, active, onClick }: { provider?: AiProviderId; label: string; active: boolean; onClick(): void }) {
  return <button type="button" onClick={onClick} className={ui.cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors", active ? "bg-background font-medium text-foreground shadow-[var(--shadow-control)]" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>{provider ? <HugeiconsIcon icon={ICON_BY_PROVIDER[provider]} size={13} strokeWidth={1.75} /> : null}<span className="truncate">{label}</span></button>;
}
function CommitInput({ ariaLabel, value, placeholder, type = "text", validate, onCommit }: { ariaLabel: string; value: string; placeholder: string; type?: string; validate?(value: string): boolean; onCommit(value: string): Promise<void> }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <ui.Input aria-label={ariaLabel} type={type} className="h-8 w-[230px] rounded-md text-xs" value={draft} placeholder={placeholder} spellCheck={false} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = draft.trim(); if (validate && !validate(next)) { setDraft(value); return; } if (next !== value) void onCommit(next); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value); event.currentTarget.blur(); } }} />;
}

function CompactThresholdControl({ value, onCommit }: { value: number; onCommit(value: number): Promise<void> }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => setDraft(value ? String(value) : ""), [value]);
  const commit = () => {
    const parsed = Number.parseInt(draft.replace(/[^\d]/g, ""), 10);
    void onCommit(Number.isFinite(parsed) && parsed > 0 ? Math.max(8_000, parsed) : 0);
  };
  return <div className="flex items-center gap-1.5"><ui.Button type="button" size="sm" variant={!value ? "default" : "outline"} className="text-xs" aria-pressed={!value} onClick={() => void onCommit(0)}>Automatic</ui.Button><ui.Input aria-label="Compact at this many tokens" inputMode="numeric" className={ui.cn("h-8 w-[130px] text-xs tabular-nums", !value && "text-muted-foreground")} value={draft} placeholder="e.g. 150000" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value ? String(value) : ""); event.currentTarget.blur(); } }} /><span className="text-xs text-muted-foreground">tokens</span></div>;
}

export function ProviderIcon({ provider, size = 14, className }: { provider: AiProviderId; size?: number; className?: string }) {
  return <HugeiconsIcon icon={ICON_BY_PROVIDER[provider]} size={size} strokeWidth={1.75} className={className} />;
}

function ProviderAvatar({ provider, compact = false }: { provider: AiProviderId; compact?: boolean }) {
  return <span className={ui.cn("flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/35 text-foreground", compact ? "size-[30px]" : "size-[34px]")}><ProviderIcon provider={provider} size={compact ? 15 : 17} /></span>;
}

function ProviderCatalogue({ providers, onAdd, onAddEndpoint }: { providers: readonly AiModelProviderCapability[]; onAdd(id: AiProviderId): void; onAddEndpoint(): void }) {
  const cloud = providers.filter((provider) => provider.keyRequirement === "required");
  const local = providers.filter((provider) => provider.keyRequirement !== "required");
  const choice = (provider: AiModelProviderCapability, source: string) => <button key={provider.id} type="button" onClick={() => onAdd(provider.id)} className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/30"><ProviderAvatar provider={provider.id} compact /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-xs font-medium text-foreground">{provider.label}</span><span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">{source}</span></span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{PROVIDER_BLURB[provider.id]}{provider.models.length > 0 ? ` · ${provider.models.length} models` : ""}</span></span><HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.7} className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" /></button>;
  const group = (title: string, description: string, icon: typeof CloudIcon, children: ReactNode) => <section className="min-w-0 p-3"><div className="mb-2 flex items-center gap-2 px-1"><HugeiconsIcon icon={icon} size={14} strokeWidth={1.7} className="text-muted-foreground" /><div><p className="text-xs font-semibold text-foreground">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div></div><div className="flex flex-col gap-0.5">{children}</div></section>;
  return <div data-onboarding-target="models.catalog" className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-control)]"><div className="border-b border-border/70 px-4 py-3"><p className="text-sm font-semibold text-foreground">Connect a model source</p><p className="mt-0.5 text-xs text-muted-foreground">Cloud providers need an API key. Local runtimes stay on your machine.</p></div><div className={ui.cn("grid divide-y divide-border/70", cloud.length > 0 && "md:grid-cols-2 md:divide-x md:divide-y-0")}>{cloud.length > 0 ? group("Cloud", "Hosted models billed by the provider", CloudIcon, cloud.map((provider) => choice(provider, "API key"))) : null}{group("Local & custom", "Your runtime, endpoint, and model id", ComputerIcon, <>{local.map((provider) => choice(provider, "Local runtime"))}<button type="button" onClick={onAddEndpoint} className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/30"><ProviderAvatar provider="openai-compatible" compact /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="text-xs font-medium text-foreground">OpenAI Compatible</span><span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">Endpoint</span></span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{PROVIDER_BLURB["openai-compatible"]}</span></span><HugeiconsIcon icon={PlugIcon} size={13} strokeWidth={1.7} className="text-muted-foreground transition-colors group-hover:text-foreground" /></button></>)}</div></div>;
}

function DisconnectButton({ label, onConfirm }: { label: string; onConfirm(): void }) {
  return <ui.AlertDialog><ui.AlertDialogTrigger asChild><ui.Button title="Remove provider" size="icon" variant="ghost" className="size-7 shrink-0 rounded-md border border-transparent text-muted-foreground hover:border-destructive hover:text-destructive"><HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} /></ui.Button></ui.AlertDialogTrigger><ui.AlertDialogContent><ui.AlertDialogHeader><ui.AlertDialogTitle>Disconnect {label}?</ui.AlertDialogTitle><ui.AlertDialogDescription>This removes its saved connection from Termco. Your provider account and remote models are not changed.</ui.AlertDialogDescription></ui.AlertDialogHeader><div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">Chats using {label} will need another model before they can send.</div><ui.AlertDialogFooter><ui.AlertDialogCancel>Keep connected</ui.AlertDialogCancel><ui.AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>Disconnect</ui.AlertDialogAction></ui.AlertDialogFooter></ui.AlertDialogContent></ui.AlertDialog>;
}

export function ProviderKeyCard({ provider, currentKey, onSave, onClear, onRemove, desktop }: {
  provider: AiModelProviderCapability;
  currentKey: string | null;
  onSave(value: string): Promise<void>;
  onClear(): Promise<void>;
  onRemove?: () => void;
  desktop: DesktopIntegrationCapability;
}) {
  const [editing, setEditing] = useState(!currentKey);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEditing(!currentKey), [currentKey]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter your API key.");
      return;
    }
    if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) {
      setError(`${provider.label} keys start with "${provider.keyPrefix}".`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setValue("");
      setReveal(false);
    } catch (cause) {
      setError(`Failed to save: ${String(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  return <div className="rounded-lg border border-border/70 bg-card p-4 shadow-[var(--shadow-control)]">
    <div className="flex items-center gap-3">
      <ProviderAvatar provider={provider.id} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold"><span>{provider.label}</span>{currentKey ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-[var(--signal-soft)] px-1.5 py-0.5 text-xs font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" />Connected</span> : null}</div>
        <div className="truncate text-xs text-muted-foreground">{PROVIDER_BLURB[provider.id]}</div>
      </div>
      {editing ? <button type="button" onClick={() => void desktop.openUrl(provider.consoleUrl)} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">Get key<HugeiconsIcon icon={ArrowUpRight01Icon} size={11} strokeWidth={1.75} /></button> : null}
      {onRemove ? <DisconnectButton label={provider.label} onConfirm={onRemove} /> : null}
    </div>
    {editing ? <div className="mt-3 flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ui.Input aria-label={`${provider.label} API key`} type={reveal ? "text" : "password"} autoComplete="off" spellCheck={false} placeholder={provider.keyPrefix ? `${provider.keyPrefix}…` : "Paste API key"} value={value} disabled={saving} onChange={(event) => { setValue(event.target.value); if (error) setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submit(); } else if (event.key === "Escape" && currentKey) { setValue(""); setReveal(false); setError(null); setEditing(false); } }} className="h-8 rounded-md pr-8 font-mono text-xs" />
          <button type="button" onClick={() => setReveal((current) => !current)} tabIndex={-1} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground" aria-label={reveal ? "Hide key" : "Show key"}><HugeiconsIcon icon={reveal ? ViewOffSlashIcon : ViewIcon} size={13} strokeWidth={1.75} /></button>
        </div>
        <ui.Button type="button" size="sm" onClick={() => void submit()} disabled={saving || !value.trim()} className="h-8 gap-1 rounded-md px-3.5 text-xs">{saving ? <ui.Spinner className="size-3" /> : null}Save</ui.Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div> : <div className="mt-3 flex items-center gap-2.5">
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 font-mono text-xs text-muted-foreground"><HugeiconsIcon icon={SquareLock02Icon} size={13} strokeWidth={1.7} className="shrink-0" /><span className="truncate">{mask(currentKey ?? "")}</span></div>
      <span className="shrink-0 text-xs text-muted-foreground/80">in OS keychain</span>
      <ui.Button type="button" size="icon" variant="ghost" onClick={() => setEditing(true)} title="Replace key" className="size-7 shrink-0 rounded-md"><HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={1.75} /></ui.Button>
      {!onRemove ? <ui.Button type="button" size="icon" variant="ghost" onClick={() => void onClear()} title="Remove key" className="size-7 shrink-0 rounded-md text-muted-foreground hover:text-destructive"><HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.75} /></ui.Button> : null}
    </div>}
  </div>;
}

function RemoveEndpointButton({ name, onConfirm }: { name: string; onConfirm(): void }) {
  return <ui.AlertDialog><ui.AlertDialogTrigger asChild><ui.Button aria-label={`Remove ${name || "custom endpoint"}`} title="Remove endpoint" size="icon" variant="ghost" className="mr-1 size-7 shrink-0 text-muted-foreground hover:text-destructive"><HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} /></ui.Button></ui.AlertDialogTrigger><ui.AlertDialogContent><ui.AlertDialogHeader><ui.AlertDialogTitle>Remove this endpoint?</ui.AlertDialogTitle><ui.AlertDialogDescription>{name || "This custom endpoint"} and its saved connection details will be removed from Termco.</ui.AlertDialogDescription></ui.AlertDialogHeader><ui.AlertDialogFooter><ui.AlertDialogCancel>Keep endpoint</ui.AlertDialogCancel><ui.AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>Remove endpoint</ui.AlertDialogAction></ui.AlertDialogFooter></ui.AlertDialogContent></ui.AlertDialog>;
}

type ProviderCardProps = {
  provider: AiModelProviderCapability; keyValue: string | null; state: SettingsState; http: HttpCapability; desktop: DesktopIntegrationCapability;
  onSaveKey(value: string): Promise<void>; onRemove(): void;
  onPersist<K extends keyof SettingsState>(key: K, value: SettingsState[K]): Promise<void>;
};

function ProviderCard(props: ProviderCardProps) {
  const { provider, keyValue, desktop, onSaveKey, onRemove } = props;
  const hasConnectionFields = provider.id === "lmstudio" || provider.id === "mlx" || provider.id === "ollama" || provider.id === "openrouter";
  if (!hasConnectionFields && provider.keyRequirement !== "none") {
    return <ProviderKeyCard provider={provider} currentKey={keyValue} onSave={onSaveKey} onClear={async () => { onRemove(); }} onRemove={onRemove} desktop={desktop} />;
  }
  return <ProviderConnectionCard {...props} />;
}

function ProviderConnectionCard({ provider, keyValue, state, http, desktop, onSaveKey, onRemove, onPersist }: ProviderCardProps) {
  const [editing, setEditing] = useState(!keyValue);
  const [keyDraft, setKeyDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const modelKey = provider.id === "lmstudio" ? "lmstudioModelId" : provider.id === "mlx" ? "mlxModelId" : provider.id === "ollama" ? "ollamaModelId" : provider.id === "openrouter" ? "openrouterModelId" : null;
  const urlKey = provider.id === "lmstudio" ? "lmstudioBaseURL" : provider.id === "mlx" ? "mlxBaseURL" : provider.id === "ollama" ? "ollamaBaseURL" : null;
  useEffect(() => setEditing(!keyValue), [keyValue]);
  const test = async () => { if (!urlKey) return; setStatus("testing"); try { setStatus((await http.ping(String(state[urlKey]))) > 0 ? "ok" : "fail"); } catch { setStatus("fail"); } };
  const submitKey = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) { setKeyError("Enter your API key."); return; }
    setSaving(true); setKeyError(null);
    try { await onSaveKey(trimmed); setKeyDraft(""); setReveal(false); }
    catch (cause) { setKeyError(`Failed to save: ${errorMessage(cause)}`); }
    finally { setSaving(false); }
  };
  const connected = Boolean(keyValue || (modelKey && String(state[modelKey]).trim()));
  const showDocs = provider.keyRequirement === "none" || editing;
  return <div className="rounded-lg border border-border/70 bg-card p-4 shadow-[var(--shadow-control)]">
    <div className="flex items-center gap-3"><ProviderAvatar provider={provider.id} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-sm font-semibold"><span>{provider.label}</span>{connected ? <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-[var(--signal-soft)] px-1.5 py-0.5 text-xs font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" />Connected</span> : null}</div><div className="truncate text-xs text-muted-foreground">{PROVIDER_BLURB[provider.id]}</div></div>{showDocs ? <button type="button" onClick={() => void desktop.openUrl(provider.consoleUrl)} className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">{provider.keyRequirement === "none" ? "Docs" : "Get key"}<HugeiconsIcon icon={ArrowUpRight01Icon} size={11} strokeWidth={1.75} /></button> : null}<DisconnectButton label={provider.label} onConfirm={onRemove} /></div>
    <div className={ui.cn("flex flex-col gap-2.5", (urlKey || modelKey) && "mt-3")}>
      {urlKey ? <Field label="Base URL"><CommitInput ariaLabel={`${provider.label} base URL`} value={String(state[urlKey])} placeholder={provider.defaultBaseUrl ?? "http://localhost:8080/v1"} onCommit={(value) => onPersist(urlKey, value)} /><ui.Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => void test()}>Test</ui.Button></Field> : null}
      {modelKey ? <Field label="Model ID"><CommitInput ariaLabel={`${provider.label} model ID`} value={String(state[modelKey])} placeholder={provider.models[0]?.id ?? "provider/model-id"} onCommit={(value) => onPersist(modelKey, value)} /></Field> : null}
      {provider.keyRequirement !== "none" ? editing ? <div className={ui.cn("flex flex-col gap-1.5", !urlKey && !modelKey && "mt-3")}><div className="flex gap-2"><div className="relative flex-1"><ui.Input aria-label={`${provider.label} API key`} type={reveal ? "text" : "password"} autoComplete="off" spellCheck={false} className="h-8 rounded-md pr-8 font-mono text-xs" value={keyDraft} disabled={saving} placeholder={provider.keyPrefix ? `${provider.keyPrefix}…` : "Paste API key"} onChange={(event) => { setKeyDraft(event.target.value); if (keyError) setKeyError(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitKey(); } else if (event.key === "Escape" && keyValue) { setKeyDraft(""); setReveal(false); setKeyError(null); setEditing(false); } }} /><button type="button" onClick={() => setReveal((value) => !value)} tabIndex={-1} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground" aria-label={reveal ? "Hide key" : "Show key"}><HugeiconsIcon icon={reveal ? ViewOffSlashIcon : ViewIcon} size={13} strokeWidth={1.75} /></button></div><ui.Button type="button" size="sm" className="h-8 gap-1 rounded-md px-3.5 text-xs" disabled={saving || !keyDraft.trim()} onClick={() => void submitKey()}>Save</ui.Button></div>{keyError ? <p className="text-xs text-destructive">{keyError}</p> : null}</div> : <div className="mt-3 flex items-center gap-2.5"><div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 font-mono text-xs text-muted-foreground"><HugeiconsIcon icon={SquareLock02Icon} size={13} strokeWidth={1.7} className="shrink-0" /><span className="truncate">{mask(keyValue ?? "")}</span></div><span className="shrink-0 text-xs text-muted-foreground/80">in OS keychain</span><ui.Button type="button" size="icon" variant="ghost" onClick={() => setEditing(true)} title="Replace key" className="size-7 shrink-0 rounded-md"><HugeiconsIcon icon={Edit02Icon} size={13} strokeWidth={1.75} /></ui.Button></div> : null}
      {status !== "idle" ? <span role="status" className={ui.cn("text-xs text-muted-foreground", status === "ok" && "text-emerald-500", status === "fail" && "text-destructive")}>{status === "testing" ? "Testing connection…" : status === "ok" ? "Connection succeeded." : "Could not reach this server."}</span> : null}
    </div>
  </div>;
}

function EndpointCard({ endpoint, keyValue, http, onUpdate, onSaveKey, onClearKey, onRemove }: { endpoint: CustomEndpoint; keyValue: string | null; http: HttpCapability; onUpdate(patch: Partial<CustomEndpoint>): Promise<void>; onSaveKey(value: string): Promise<void>; onClearKey(): Promise<void>; onRemove(): void }) {
  const [expanded, setExpanded] = useState(!endpoint.baseURL.trim());
  const [keyDraft, setKeyDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const test = async () => { setStatus("testing"); try { setStatus((await http.ping(endpoint.baseURL)) > 0 ? "ok" : "fail"); } catch { setStatus("fail"); } };
  return <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-control)]"><div className="flex items-center gap-2 px-3 py-2.5"><button type="button" className="flex flex-1 items-center gap-2 text-left" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ProviderAvatar provider="openai-compatible" compact /><span className="min-w-0 flex-1"><strong className="text-sm">{endpoint.name || "OpenAI Compatible"}</strong>{endpoint.modelId ? <span className="ml-2 font-mono text-xs text-muted-foreground">{endpoint.modelId}</span> : null}</span>{endpoint.baseURL.trim() && endpoint.modelId.trim() ? <ui.Badge variant="outline" className="ml-1 h-auto gap-1.5 rounded-md border-border/60 bg-accent px-2 py-0.5 font-mono text-xs font-normal text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />Connected</ui.Badge> : null}</button><RemoveEndpointButton name={endpoint.name} onConfirm={onRemove} /></div>
    {expanded ? <div data-testid="compatible-endpoint-form" className="flex flex-col gap-3 border-t border-border/70 px-4 pb-4 pt-4">
      <Field label="Name"><CommitInput ariaLabel="Endpoint name" value={endpoint.name} placeholder="My endpoint" onCommit={(value) => onUpdate({ name: value })} /></Field>
      <Field label="Base URL"><CommitInput ariaLabel="Endpoint base URL" value={endpoint.baseURL} placeholder="https://api.example.com/v1" onCommit={(value) => onUpdate({ baseURL: value })} /><ui.Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={!endpoint.baseURL.trim()} onClick={() => void test()}>Test</ui.Button></Field>
      <Field label="Model ID"><CommitInput ariaLabel="Endpoint model ID" value={endpoint.modelId} placeholder="gpt-4o, qwen3-max, …" onCommit={(value) => onUpdate({ modelId: value })} /></Field>
      <Field label="Context"><CommitInput ariaLabel="Endpoint context limit" value={String(endpoint.contextLimit)} placeholder="128000" validate={() => true} onCommit={async (value) => { await onUpdate({ contextLimit: normalizeEndpointContextLimit(Number(value)) }); }} /><span className="text-xs text-muted-foreground">tokens</span></Field>
      <Field label="API key">{keyValue ? <><code className="font-mono text-xs text-muted-foreground">{mask(keyValue)}</code><ui.Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void onClearKey()}>Remove key</ui.Button></> : <><ui.Input aria-label="Endpoint API key" type="password" className="h-8 w-[230px] text-xs" value={keyDraft} placeholder="Optional API key" onChange={(event) => setKeyDraft(event.target.value)} /><ui.Button type="button" size="sm" className="h-8 text-xs" disabled={!keyDraft.trim()} onClick={() => void onSaveKey(keyDraft).then(() => setKeyDraft("")).catch(() => {})}>Save</ui.Button></>}</Field>
      {status !== "idle" ? <span role="status" className={ui.cn("text-xs text-muted-foreground", status === "ok" && "text-emerald-500", status === "fail" && "text-destructive")}>{status === "testing" ? "Testing connection…" : status === "ok" ? "Connection succeeded." : "Could not reach this endpoint."}</span> : null}
    </div> : null}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex items-center gap-3"><span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>{children}</label>; }

const plugin: PluginModule = {
  inject: [
    AI_MODELS_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    SECRETS_APPLICATION_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    NETWORK_HTTP_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    UI_SETTINGS_SECTIONS_SERVICE,
    UI_SETTINGS_VIEW_SERVICE,
  ],
  optionalInject: [ONBOARDING_REGISTRY_SERVICE, ONBOARDING_RUNTIME_SERVICE],
  async activate(context) {
    const providers = context.get<AiModelRegistry>("ai.models").snapshot();
    const settingsView = context.get<UiSettingsViewCapability>(UI_SETTINGS_VIEW_SERVICE);
    contributeOnboarding(
      context,
      createModelsOnboardingContribution(settingsView),
      "Model connection guidance",
    );
    context.feature(
      {
        id: "onboarding:models-context",
        label: "Contextual model guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        let sequence = settingsView.snapshot().openSequence;
        return settingsView.subscribe(() => {
          const next = settingsView.snapshot();
          if (
            next.open &&
            next.requestedSection === "models" &&
            next.openSequence !== sequence
          ) {
            void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
              .suggest("models-settings.connect-a-model");
          }
          sequence = next.openSequence;
        });
      },
    );
    const contribution: UiSettingsSectionContribution = {
      id: "models", label: "Models", description: "Connect providers — keys live in your OS keychain.", category: "Intelligence", order: 60,
      icon: AiScanIcon,
      Component: createModelsSettings({
        providers,
        preferences: context.get<PreferencesCapability>("settings.preferences"),
        secrets: context.get<SecretsCapability>("secrets.application"),
        events: context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
        http: context.get<HttpCapability>("network.http"),
        desktop: context.get<DesktopIntegrationCapability>("desktop.integration"),
      }),
      searchEntries: [
        { title: "Default model", description: "Model used for new chats", keywords: "assistant ai" },
        { title: "Model used to compact long chats", description: "Cheaper model for summarising a conversation that outgrew the context", keywords: "compaction compress summary context window cost" },
        { title: "Compact automatically at", description: "How many tokens the conversation may reach before it summarises itself", keywords: "compaction threshold tokens context window auto summarise limit" },
        { title: "Providers", description: "Connect cloud or local model sources", keywords: "anthropic openai ollama api key" },
      ],
    };
    await context.effect(() =>
      context
        .get<UiSettingsSectionRegistry>("ui.settings.sections")
        .register(contribution, { pluginId: "models-settings", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
