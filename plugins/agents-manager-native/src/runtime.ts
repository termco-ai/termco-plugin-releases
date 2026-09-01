import type {
  AiLibraryAgent,
  AiLibraryCapability,
  AiLibraryMcpServer,
  AiLibraryMcpStatus,
  AiLibrarySkill,
  AiLibrarySnapshot,
  AiLibrarySnippet,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import ui from "@termco/ui";

type RuntimeState = AiLibrarySnapshot & {
  revision: number;
  hydrated: boolean;
  customInstructions: string;
};

const empty: RuntimeState = {
  revision: 0,
  hydrated: false,
  agents: [],
  customAgents: [],
  activeAgentId: "builtin:coder",
  snippets: [],
  skills: [],
  disabledSkillIds: [],
  enabledProjectSkills: {},
  enabledMcpServers: {},
  userMcpServers: [],
  disabledUserMcpServers: [],
  mcpStatus: {},
  customInstructions: "",
};

let current = empty;
let library: AiLibraryCapability | null = null;
let preferences: PreferencesCapability | null = null;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function libraryRuntimeActive(): boolean {
  return library !== null;
}

function publish(next: Partial<RuntimeState>) {
  current = { ...current, ...next, revision: current.revision + 1 };
  for (const listener of listeners) listener();
}

async function refresh() {
  if (!library || !preferences) return;
  const [snapshot, customInstructions] = await Promise.all([
    library.snapshot(),
    preferences.get<string>("customInstructions"),
  ]);
  publish({
    ...snapshot,
    customInstructions: customInstructions ?? "",
    hydrated: true,
  });
}

export function configureLibraryRuntime(
  selectedLibrary: AiLibraryCapability,
  selectedPreferences: PreferencesCapability,
  events: ApplicationEventsCapability,
): () => void {
  library = selectedLibrary;
  preferences = selectedPreferences;
  initPromise = null;
  const offLibrary = events.subscribe("ai.library.changed", () => void refresh());
  const offPreferences = events.subscribe("termco://prefs-changed", () => void refresh());
  void hydrate();
  return () => {
    offPreferences();
    offLibrary();
    if (library === selectedLibrary) library = null;
    if (preferences === selectedPreferences) preferences = null;
    initPromise = null;
  };
}

export function hydrate(): Promise<void> {
  initPromise ??= refresh();
  return initPromise;
}

export function snapshot(): RuntimeState {
  return current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLibrarySelector<T>(selector: (state: RuntimeState) => T): T {
  return selector(
    ui.React.useSyncExternalStore(subscribe, snapshot, snapshot),
  );
}

async function mutate(operation: (capability: AiLibraryCapability) => Promise<void>) {
  if (!library) throw new Error("ai.library is unavailable");
  await operation(library);
  await refresh();
}

export const actions = {
  setActiveAgent: (id: string) => mutate((capability) => capability.setActiveAgent(id)),
  upsertAgent: (agent: AiLibraryAgent) => mutate((capability) => capability.upsertAgent(agent)),
  removeAgent: (id: string) => mutate((capability) => capability.removeAgent(id)),
  upsertSnippet: (snippet: AiLibrarySnippet) => mutate((capability) => capability.upsertSnippet(snippet)),
  removeSnippet: (id: string) => mutate((capability) => capability.removeSnippet(id)),
  upsertSkill: (skill: AiLibrarySkill) => mutate((capability) => capability.upsertSkill(skill)),
  removeSkill: (id: string) => mutate((capability) => capability.removeSkill(id)),
  toggleSkill: (id: string) => mutate((capability) => capability.toggleSkill(id)),
  setProjectSkillEnabled: (scope: string, key: string, enabled: boolean) =>
    mutate((capability) => capability.setProjectSkillEnabled(scope, key, enabled)),
  setMcpServerEnabled: (scope: string, server: AiLibraryMcpServer, enabled: boolean) =>
    mutate((capability) => capability.setMcpServerEnabled(scope, server, enabled)),
  addMcpServers: (servers: AiLibraryMcpServer[]) =>
    mutate((capability) => capability.addMcpServers(servers)),
  removeMcpServer: (name: string) => mutate((capability) => capability.removeMcpServer(name)),
  toggleMcpServer: (server: AiLibraryMcpServer) =>
    mutate((capability) => capability.toggleMcpServer(server)),
  connectMcpServer: (server: AiLibraryMcpServer) =>
    mutate((capability) => capability.connectMcpServer(server)),
  disconnectMcpServer: (name: string) =>
    mutate((capability) => capability.disconnectMcpServer(name)),
  signOutMcpServer: (name: string) =>
    mutate((capability) => capability.signOutMcpServer(name)),
  async setCustomInstructions(value: string) {
    if (!preferences) throw new Error("settings.preferences is unavailable");
    await preferences.set("customInstructions", value);
    publish({ customInstructions: value });
  },
};

export type { AiLibraryMcpStatus };
