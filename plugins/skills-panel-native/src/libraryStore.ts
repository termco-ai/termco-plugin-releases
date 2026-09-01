import type {
  AiLibraryAgent,
  AiLibraryCapability,
  AiLibraryMcpServer,
  AiLibrarySkill,
  AiLibrarySnapshot,
  AiLibrarySnippet,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import ui from "@termco/ui";

type State = AiLibrarySnapshot & { revision: number; hydrated: boolean };
let current: State = {
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
};
let library: AiLibraryCapability | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
export function libraryRuntimeActive(): boolean {
  return library !== null;
}
const publish = (snapshot: AiLibrarySnapshot) => {
  current = { ...snapshot, hydrated: true, revision: current.revision + 1 };
  for (const listener of listeners) listener();
};
const refresh = async () => {
  if (library) publish(await library.snapshot());
};
const hydrate = () => (loading ??= refresh());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function useRevision() {
  ui.React.useSyncExternalStore(subscribe, () => current.revision, () => current.revision);
}
async function mutate(operation: (selected: AiLibraryCapability) => Promise<void>) {
  if (!library) throw new Error("ai.library is unavailable");
  await operation(library);
  await refresh();
}

export function configureLibrary(
  capability: AiLibraryCapability,
  events: ApplicationEventsCapability,
): () => void {
  library = capability;
  loading = null;
  const off = events.subscribe("ai.library.changed", () => void refresh());
  void hydrate();
  return () => {
    off();
    if (library === capability) library = null;
    loading = null;
  };
}

export function newAgentId() {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
export function newSkillId() {
  return `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
export function newSnippetId() {
  return `sn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const agentsState = () => ({
  customAgents: current.customAgents,
  activeId: current.activeAgentId,
  hydrate,
  upsert: (agent: AiLibraryAgent) => void mutate((selected) => selected.upsertAgent(agent)),
  setActiveId: (id: string) => void mutate((selected) => selected.setActiveAgent(id)),
  remove: (id: string) => void mutate((selected) => selected.removeAgent(id)),
});
export function useAgentsStore<T>(selector: (state: ReturnType<typeof agentsState>) => T): T {
  useRevision();
  return selector(agentsState());
}

const snippetsState = () => ({
  snippets: current.snippets,
  hydrate,
  upsert: (snippet: AiLibrarySnippet) => void mutate((selected) => selected.upsertSnippet(snippet)),
  remove: (id: string) => void mutate((selected) => selected.removeSnippet(id)),
});
export function useSnippetsStore<T>(selector: (state: ReturnType<typeof snippetsState>) => T): T {
  useRevision();
  return selector(snippetsState());
}

const skillsState = () => ({
  library: current.skills,
  libraryDisabled: current.disabledSkillIds,
  enabledProject: current.enabledProjectSkills,
  hydrate,
  importSkill: (skill: AiLibrarySkill) => void mutate((selected) => selected.upsertSkill(skill)),
  removeFromLibrary: (id: string) => void mutate((selected) => selected.removeSkill(id)),
  toggleLibrary: (id: string) => void mutate((selected) => selected.toggleSkill(id)),
  setProjectEnabled: (scope: string, key: string, enabled: boolean) =>
    void mutate((selected) => selected.setProjectSkillEnabled(scope, key, enabled)),
});
export function useSkillsStore<T>(selector: (state: ReturnType<typeof skillsState>) => T): T {
  useRevision();
  return selector(skillsState());
}

const mcpState = () => ({
  status: current.mcpStatus,
  enabledServers: current.enabledMcpServers,
  userServers: current.userMcpServers,
  hydrate,
  setServerEnabled: (scope: string, server: AiLibraryMcpServer, enabled: boolean) =>
    mutate((selected) => selected.setMcpServerEnabled(scope, server, enabled)),
  connectServer: (server: AiLibraryMcpServer) =>
    mutate((selected) => selected.connectMcpServer(server)),
  addUserServers: (servers: AiLibraryMcpServer[]) =>
    mutate((selected) => selected.addMcpServers(servers)),
  isUserDisabled: (name: string) => current.disabledUserMcpServers.includes(name),
  toggleUserServer: (server: AiLibraryMcpServer) =>
    mutate((selected) => selected.toggleMcpServer(server)),
  removeUserServer: (name: string) => mutate((selected) => selected.removeMcpServer(name)),
});
export function useMcpStore<T>(selector: (state: ReturnType<typeof mcpState>) => T): T {
  useRevision();
  return selector(mcpState());
}
