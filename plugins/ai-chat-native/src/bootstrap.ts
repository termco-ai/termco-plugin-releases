import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { EMPTY_PROVIDER_KEYS } from "./store/constants";
import { useChatStore } from "./store/store";
import type { CustomEndpointKeys, ProviderKeys } from "./store/types";

const KEYS_CHANGED_EVENT = "termco://ai-keys-changed";
const PREFERENCES_CHANGED_EVENT = "termco://prefs-changed";
const CONFIGURATION_PREFERENCE_KEYS = new Set([
  "customEndpoints",
  "lmstudioModelId",
  "mlxModelId",
  "ollamaModelId",
  "openrouterModelId",
]);

async function loadConfiguration(input: {
  inference: AiInferenceCapability;
  models: readonly AiModelProviderCapability[];
}): Promise<{ apiKeys: ProviderKeys; endpointKeys: CustomEndpointKeys }> {
  const configured = await input.inference.configuration();
  const apiKeys = { ...EMPTY_PROVIDER_KEYS };
  for (const provider of input.models) {
    if (configured.configuredProviderIds.includes(provider.id)) {
      // UI store values are presence sentinels, never secrets.
      apiKeys[provider.id] = "configured";
    }
  }
  const endpointKeys = Object.fromEntries(
    configured.configuredCustomEndpointIds.map((id) => [id, "configured"]),
  );
  return { apiKeys, endpointKeys };
}

/** Initialize the selected provider independently of any chat UI component.
 * This must run again after live replacement because the replacement owns a
 * fresh store and the old React bootstrap is intentionally not its owner. */
export async function bootstrapSessions(input: {
  preferences: PreferencesCapability;
  inference: AiInferenceCapability;
  events: ApplicationEventsCapability;
  models: readonly AiModelProviderCapability[];
}): Promise<() => void> {
  let active = true;
  const reloadCredentials = async () => {
    const loaded = await loadConfiguration(input);
    if (!active) return;
    const state = useChatStore.getState();
    state.setApiKeys(loaded.apiKeys);
    state.setCustomEndpointKeys(loaded.endpointKeys);
    state.setKeysLoaded(true);
  };
  const reloadPreferences = async (payload?: unknown) => {
    const key =
      payload && typeof payload === "object"
        ? (payload as { key?: unknown }).key
        : undefined;
    if (
      key !== undefined &&
      key !== "defaultModelId" &&
      !CONFIGURATION_PREFERENCE_KEYS.has(String(key))
    ) {
      return;
    }
    if (key === undefined || key === "defaultModelId") {
      const defaultModel = await input.preferences.get<string>("defaultModelId");
      if (active && defaultModel) {
        useChatStore.getState().setSelectedModelId(defaultModel);
      }
    }
    if (key === undefined || CONFIGURATION_PREFERENCE_KEYS.has(String(key))) {
      await reloadCredentials();
    }
  };

  await Promise.all([
    useChatStore.getState().hydrateSessions(),
    reloadPreferences(),
  ]);
  const disposeKeys = input.events.subscribe(KEYS_CHANGED_EVENT, () => {
    void reloadCredentials();
  });
  const disposePreferences = input.events.subscribe(
    PREFERENCES_CHANGED_EVENT,
    (payload) => {
      void reloadPreferences(payload);
    },
  );
  return () => {
    active = false;
    disposePreferences();
    disposeKeys();
  };
}
