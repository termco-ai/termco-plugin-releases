import type {
  AiSpeechProvider as SttProvider,
} from "@termco/ai-inference-base";
import type {
  AiCustomModelEndpoint as CustomEndpoint,
  AiReasoningEffort as ReasoningEffort,
} from "@termco/ai-models-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import { create } from "zustand";

export type AiUiPreferences = {
  favoriteModelIds: string[];
  recentModelIds: string[];
  customEndpoints: CustomEndpoint[];
  reasoningByModel: Record<string, ReasoningEffort>;
  agentAutoApprove: boolean;
  customInstructions: string;
  compactionModelId: string;
  compactThresholdTokens: number;
  richChatUi: boolean;
  terseReplies: boolean;
  sttProvider: SttProvider;
  groqSttModel: string;
  whispercppBaseURL: string;
};

const defaults: AiUiPreferences = {
  favoriteModelIds: [],
  recentModelIds: [],
  customEndpoints: [],
  reasoningByModel: {},
  agentAutoApprove: false,
  customInstructions: "",
  compactionModelId: "",
  compactThresholdTokens: 0,
  richChatUi: true,
  terseReplies: false,
  sttProvider: "openai",
  groqSttModel: "whisper-large-v3-turbo",
  whispercppBaseURL: "http://127.0.0.1:8080",
};

export const usePreferencesStore = create<AiUiPreferences>(() => defaults);

let capability: PreferencesCapability | null = null;
let disposeEvents: (() => void) | null = null;

export function aiUiPreferencesActive(): boolean {
  return capability !== null || disposeEvents !== null;
}

const keys = Object.keys(defaults) as Array<keyof AiUiPreferences>;

async function refresh(): Promise<void> {
  if (!capability) return;
  const values = await capability.getMany(keys);
  const next: Partial<AiUiPreferences> = {};
  for (const key of keys) {
    if (values[key] !== undefined) next[key] = values[key] as never;
  }
  usePreferencesStore.setState(next);
}

export async function configureAiUiPreferences(
  preferences: PreferencesCapability,
  events: ApplicationEventsCapability,
): Promise<() => void> {
  capability = preferences;
  disposeEvents?.();
  disposeEvents = events.subscribe("termco://prefs-changed", () => void refresh());
  // Endpoint metadata, including each endpoint's context window, must be ready
  // before restored sessions select their model and calculate thresholds.
  await refresh();
  return () => {
    disposeEvents?.();
    disposeEvents = null;
    if (capability === preferences) capability = null;
  };
}

async function setPreference<K extends keyof AiUiPreferences>(
  key: K,
  value: AiUiPreferences[K],
): Promise<void> {
  usePreferencesStore.setState({ [key]: value } as Pick<AiUiPreferences, K>);
  await capability?.set(key, value);
}

export const setFavoriteModelIds = (value: string[]) =>
  setPreference("favoriteModelIds", value);
export const setRecentModelIds = (value: string[]) =>
  setPreference("recentModelIds", value);
export const setReasoningByModel = (value: Record<string, ReasoningEffort>) =>
  setPreference("reasoningByModel", value);
export const setAgentAutoApprove = (value: boolean) =>
  setPreference("agentAutoApprove", value);
export const setRichChatUi = (value: boolean) =>
  setPreference("richChatUi", value);
export const setTerseReplies = (value: boolean) =>
  setPreference("terseReplies", value);
