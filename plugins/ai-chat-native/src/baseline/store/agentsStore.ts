import type {
  AiLibraryAgent as Agent,
  AiLibraryCapability,
  AiLibrarySnapshot,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { McpTool } from "@termco/mcp-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { AI_LIBRARY_EVENTS } from "@termco/ai-library-base";
import { create } from "zustand";

type AgentsState = {
  hydrated: boolean;
  agents: Agent[];
  customAgents: Agent[];
  activeId: string;
  all: () => Agent[];
  setActiveId: (id: string) => void;
  upsert: (agent: Agent) => void;
  remove: (id: string) => void;
};

let library: AiLibraryCapability | null = null;
let librarySnapshot: AiLibrarySnapshot | null = null;

export function aiAgentsStoreActive(): boolean {
  return library !== null || librarySnapshot !== null;
}

function workspaceScopeKey(workspace: WorkspaceEnv): string {
  if (!workspace || workspace.kind === "local") return "local";
  if (workspace.kind === "wsl") return `wsl:${workspace.distro}`;
  return `ssh:${workspace.connectionId}`;
}

/** Resolve the MCP tools selected for one chat workspace from the shared
 * application-wide library snapshot. The chat does not own connection state. */
export function mcpToolsFor(
  root: string | null,
  workspace: WorkspaceEnv,
): Array<{ server: string; tool: McpTool }> {
  const snapshot = librarySnapshot;
  if (!snapshot || !root) return [];
  const scope = `${workspaceScopeKey(workspace)}::${root.replace(/\/+$/, "")}`;
  const disabled = new Set(snapshot.disabledUserMcpServers);
  const names = new Set([
    ...snapshot.userMcpServers
      .map((server) => server.name)
      .filter((name) => !disabled.has(name)),
    ...(snapshot.enabledMcpServers[scope] ?? []),
  ]);
  return [...names].flatMap((name) => {
    const status = snapshot.mcpStatus[name];
    if (!status?.connected) return [];
    return status.tools.map((tool) => ({ server: name, tool }));
  });
}

export function selectedAgent(): Agent | null {
  const state = useAgentsStore.getState();
  return state.agents.find((agent) => agent.id === state.activeId) ??
    state.agents[0] ?? null;
}

export function enabledSkillsFor(root: string | null) {
  const snapshot = librarySnapshot;
  if (!snapshot) return [];
  const disabled = new Set(snapshot.disabledSkillIds);
  return snapshot.skills.filter((skill) => {
    if (disabled.has(skill.id)) return false;
    if (skill.source.origin !== "project") return true;
    if (!root) return false;
    const enabled = snapshot.enabledProjectSkills[root] ?? [];
    return enabled.includes(skill.id) || enabled.includes(skill.name);
  });
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  hydrated: false,
  agents: [],
  customAgents: [],
  activeId: "",
  all: () => get().agents,
  setActiveId: (id) => {
    const selected = library;
    set({ activeId: id });
    if (selected) void selected.setActiveAgent(id).catch(() => refresh(selected));
  },
  upsert: (agent) => {
    const selected = library;
    if (selected) void selected.upsertAgent(agent).catch(() => refresh(selected));
  },
  remove: (id) => {
    const selected = library;
    if (selected) void selected.removeAgent(id).catch(() => refresh(selected));
  },
}));

async function refresh(selected: AiLibraryCapability): Promise<void> {
  const snapshot = await selected.snapshot();
  if (library !== selected) return;
  librarySnapshot = snapshot;
  useAgentsStore.setState({
    hydrated: true,
    agents: [...snapshot.agents],
    customAgents: [...snapshot.customAgents],
    activeId: snapshot.activeAgentId,
  });
}

/** Bind the chat persona picker to the one selected application-wide library.
 * The chat never owns or persists a second agent catalogue. */
export async function configureAgentsStore(
  selected: AiLibraryCapability,
  events: ApplicationEventsCapability,
): Promise<() => void> {
  library = selected;
  try {
    await refresh(selected);
  } catch (error) {
    if (library === selected) {
      library = null;
      librarySnapshot = null;
    }
    throw error;
  }
  const off = events.subscribe(AI_LIBRARY_EVENTS.changed, () => {
    void refresh(selected);
  });
  return () => {
    off();
    if (library === selected) {
      library = null;
      librarySnapshot = null;
    }
  };
}
