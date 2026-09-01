import type {
  AiLibraryAgent,
  AiLibraryCapability,
  AiLibraryMcpServer,
  AiLibraryMcpStatus,
  AiLibrarySourceRegistry,
  AiLibrarySkill,
  AiLibrarySnapshot,
  AiLibrarySnippet,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type { McpClientsCapability } from "@termco/mcp-base";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import { BUILTIN_AGENTS } from "./builtins";
import { discover } from "./discovery/discover";
import { createAiLibrarySources } from "./sources";
import {
  AI_LIBRARY_SERVICE,
  AI_LIBRARY_SOURCES_SERVICE,
} from "@termco/ai-library-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { MCP_CLIENTS_SERVICE } from "@termco/mcp-base";
import { STORAGE_APPLICATION_SERVICE } from "@termco/storage-base";

const CHANGED_EVENT = "ai.library.changed";
const LEGACY_EVENTS = [
  "termco://ai-agents-changed",
  "termco://ai-snippets-changed",
  "termco://ai-skills-changed",
  "termco://ai-mcp-changed",
] as const;
const STORE_NAMES = [
  "termco-ai-agents.json",
  "termco-ai-snippets.json",
  "termco-ai-skills.json",
  "termco-ai-mcp.json",
] as const;

type State = Omit<
  AiLibrarySnapshot,
  "agents" | "mcpStatus"
> & { mcpStatus: Record<string, AiLibraryMcpStatus> };

type Stores = {
  agents: StorageHandle;
  snippets: StorageHandle;
  skills: StorageHandle;
  mcp: StorageHandle;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function save(store: StorageHandle, entries: Record<string, unknown>) {
  for (const [key, value] of Object.entries(entries)) store.set(key, value);
  await store.save();
}

export async function createLibrary(
  storage: StorageCapability,
  mcp: McpClientsCapability,
  events: ApplicationEventsCapability,
  filesOrDiscover:
    | WorkspaceFilesCapability
    | ((
        root: string | null,
        workspace: import("@termco/workspace-base").WorkspaceEnv,
        refresh?: boolean,
      ) => Promise<import("@termco/ai-library-base").AiLibraryDiscoveryResult>),
): Promise<{
  capability: AiLibraryCapability;
  dispose: () => Promise<void>;
}> {
  const opened = await Promise.allSettled(
    STORE_NAMES.map((name) => storage.open(name)),
  );
  const failed = opened.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) {
    await Promise.allSettled(
      STORE_NAMES.flatMap((name, index) =>
        opened[index]?.status === "fulfilled" ? [storage.close(name)] : [],
      ),
    );
    throw failed.reason;
  }
  const [agents, snippets, skills, mcpStore] = opened.map(
    (result) => (result as PromiseFulfilledResult<StorageHandle>).value,
  );
  const stores: Stores = { agents, snippets, skills, mcp: mcpStore };
  const ownedConnections = new Set<string>();
  let disposed = false;
  const state: State = {
    customAgents: clone(agents.get<AiLibraryAgent[]>("customAgents") ?? []),
    activeAgentId:
      agents.get<string>("activeAgentId") ?? BUILTIN_AGENTS[0].id,
    snippets: clone(snippets.get<AiLibrarySnippet[]>("snippets") ?? []),
    skills: clone(skills.get<AiLibrarySkill[]>("library") ?? []),
    disabledSkillIds: clone(
      skills.get<string[]>("libraryDisabled") ?? [],
    ),
    enabledProjectSkills: clone(
      skills.get<Record<string, string[]>>("enabledProject") ?? {},
    ),
    enabledMcpServers: clone(
      mcpStore.get<Record<string, string[]>>("enabledServers") ?? {},
    ),
    userMcpServers: clone(
      mcpStore.get<AiLibraryMcpServer[]>("userServers") ?? [],
    ),
    disabledUserMcpServers: clone(
      mcpStore.get<string[]>("userDisabled") ?? [],
    ),
    mcpStatus: {},
  };

  const publish = () => {
    events.emit(CHANGED_EVENT, null);
    for (const event of LEGACY_EVENTS) events.emit(event, null);
  };

  const connect = async (server: AiLibraryMcpServer) => {
    if (disposed) return;
    state.mcpStatus[server.name] = {
      connecting: true,
      connected: false,
      tools: state.mcpStatus[server.name]?.tools ?? [],
    };
    publish();
    const result = await mcp.connect(server);
    if (disposed) {
      if (!("error" in result)) mcp.disconnect(server.name);
      return;
    }
    if (!("error" in result)) ownedConnections.add(server.name);
    state.mcpStatus[server.name] =
      "error" in result
        ? { connecting: false, connected: false, tools: [], error: result.error }
        : { connecting: false, connected: true, tools: clone(result.tools) };
    publish();
  };

  const disconnect = (name: string) => {
    mcp.disconnect(name);
    ownedConnections.delete(name);
    delete state.mcpStatus[name];
    publish();
  };

  const offOauth = events.subscribe("mcp-oauth://progress", (payload) => {
    const progress = payload as {
      server?: string;
      state?: AiLibraryMcpStatus["authState"] | "done";
    };
    if (!progress.server || !state.mcpStatus[progress.server]) return;
    state.mcpStatus[progress.server] = {
      ...state.mcpStatus[progress.server],
      authState: progress.state === "done" ? undefined : progress.state,
    };
    publish();
  });

  const capability: AiLibraryCapability = {
    async snapshot() {
      return clone({
        ...state,
        agents: [...BUILTIN_AGENTS, ...state.customAgents],
      });
    },
    discover: (root, workspace, refresh) =>
      typeof filesOrDiscover === "function"
        ? filesOrDiscover(root, workspace, refresh)
        : discover(filesOrDiscover, root, workspace, refresh),
    async setActiveAgent(id) {
      const all = [...BUILTIN_AGENTS, ...state.customAgents];
      state.activeAgentId = all.some((agent) => agent.id === id)
        ? id
        : BUILTIN_AGENTS[0].id;
      await save(stores.agents, { activeAgentId: state.activeAgentId });
      publish();
    },
    async upsertAgent(agent) {
      if (agent.builtIn) return;
      const index = state.customAgents.findIndex((item) => item.id === agent.id);
      state.customAgents =
        index < 0
          ? [...state.customAgents, clone(agent)]
          : state.customAgents.map((item) =>
              item.id === agent.id ? clone(agent) : item,
            );
      await save(stores.agents, { customAgents: state.customAgents });
      publish();
    },
    async removeAgent(id) {
      state.customAgents = state.customAgents.filter((agent) => agent.id !== id);
      if (state.activeAgentId === id) state.activeAgentId = BUILTIN_AGENTS[0].id;
      await save(stores.agents, {
        customAgents: state.customAgents,
        activeAgentId: state.activeAgentId,
      });
      publish();
    },
    async upsertSnippet(snippet) {
      const index = state.snippets.findIndex((item) => item.id === snippet.id);
      state.snippets =
        index < 0
          ? [...state.snippets, clone(snippet)]
          : state.snippets.map((item) =>
              item.id === snippet.id ? clone(snippet) : item,
            );
      await save(stores.snippets, { snippets: state.snippets });
      publish();
    },
    async removeSnippet(id) {
      state.snippets = state.snippets.filter((snippet) => snippet.id !== id);
      await save(stores.snippets, { snippets: state.snippets });
      publish();
    },
    async upsertSkill(skill) {
      const index = state.skills.findIndex((item) => item.id === skill.id);
      state.skills =
        index < 0
          ? [...state.skills, clone(skill)]
          : state.skills.map((item) =>
              item.id === skill.id ? clone(skill) : item,
            );
      await save(stores.skills, { library: state.skills });
      publish();
    },
    async removeSkill(id) {
      state.skills = state.skills.filter((skill) => skill.id !== id);
      state.disabledSkillIds = state.disabledSkillIds.filter((item) => item !== id);
      await save(stores.skills, {
        library: state.skills,
        libraryDisabled: state.disabledSkillIds,
      });
      publish();
    },
    async toggleSkill(id) {
      state.disabledSkillIds = state.disabledSkillIds.includes(id)
        ? state.disabledSkillIds.filter((item) => item !== id)
        : [...state.disabledSkillIds, id];
      await save(stores.skills, { libraryDisabled: state.disabledSkillIds });
      publish();
    },
    async setProjectSkillEnabled(scopeRootKey, key, enabled) {
      const selected = new Set(state.enabledProjectSkills[scopeRootKey] ?? []);
      if (enabled) selected.add(key);
      else selected.delete(key);
      state.enabledProjectSkills = {
        ...state.enabledProjectSkills,
        [scopeRootKey]: [...selected],
      };
      await save(stores.skills, { enabledProject: state.enabledProjectSkills });
      publish();
    },
    async setMcpServerEnabled(scopeRootKey, server, enabled) {
      const selected = new Set(state.enabledMcpServers[scopeRootKey] ?? []);
      if (enabled) selected.add(server.name);
      else selected.delete(server.name);
      state.enabledMcpServers = {
        ...state.enabledMcpServers,
        [scopeRootKey]: [...selected],
      };
      await save(stores.mcp, { enabledServers: state.enabledMcpServers });
      if (enabled) await connect(server);
      else disconnect(server.name);
      publish();
    },
    async addMcpServers(serversToAdd) {
      const byName = new Map(
        state.userMcpServers.map((server) => [server.name, server]),
      );
      for (const server of serversToAdd) byName.set(server.name, clone(server));
      state.userMcpServers = [...byName.values()];
      await save(stores.mcp, { userServers: state.userMcpServers });
      for (const server of serversToAdd) await connect(server);
      publish();
    },
    async removeMcpServer(name) {
      state.userMcpServers = state.userMcpServers.filter(
        (server) => server.name !== name,
      );
      state.disabledUserMcpServers = state.disabledUserMcpServers.filter(
        (item) => item !== name,
      );
      await save(stores.mcp, {
        userServers: state.userMcpServers,
        userDisabled: state.disabledUserMcpServers,
      });
      disconnect(name);
      publish();
    },
    async toggleMcpServer(server) {
      const disabled = !state.disabledUserMcpServers.includes(server.name);
      state.disabledUserMcpServers = disabled
        ? [...state.disabledUserMcpServers, server.name]
        : state.disabledUserMcpServers.filter((item) => item !== server.name);
      await save(stores.mcp, {
        userDisabled: state.disabledUserMcpServers,
      });
      if (disabled) disconnect(server.name);
      else await connect(server);
      publish();
    },
    async connectMcpServer(server) {
      await connect(server);
    },
    async disconnectMcpServer(name) {
      disconnect(name);
    },
    async signOutMcpServer(name) {
      await mcp.clearOAuth(name);
      delete state.mcpStatus[name];
      publish();
    },
  };

  const disabled = new Set(state.disabledUserMcpServers);
  for (const server of state.userMcpServers) {
    if (!disabled.has(server.name)) void connect(server);
  }

  return {
    capability,
    async dispose() {
      disposed = true;
      const failures: unknown[] = [];
      try {
        offOauth();
      } catch (error) {
        failures.push(error);
      }
      for (const name of ownedConnections) {
        try {
          mcp.disconnect(name);
        } catch (error) {
          failures.push(error);
        }
      }
      ownedConnections.clear();
      const closed = await Promise.allSettled(
        STORE_NAMES.map((name) => storage.close(name)),
      );
      for (const result of closed) {
        if (result.status === "rejected") failures.push(result.reason);
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, "failed to dispose AI library resources");
      }
    },
  };
}

const plugin: PluginModule = {
  inject: [
    STORAGE_APPLICATION_SERVICE,
    EVENTS_APPLICATION_SERVICE,
  ],
  async activate(context) {
    const sources = createAiLibrarySources();
    const sourceRegistry = sources.registry;
    const library = await createLibrary(
      context.get<StorageCapability>("storage.application"),
      sources.mcp,
      context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      sources.discover,
    );
    await context.effect(() => library.dispose);
    context.provide<AiLibraryCapability>(AI_LIBRARY_SERVICE, library.capability);
    context.provide<AiLibrarySourceRegistry>(
      AI_LIBRARY_SOURCES_SERVICE,
      sourceRegistry,
    );
    context.feature(
      {
        id: "mcp-source",
        label: "MCP library source",
        requires: [AI_LIBRARY_SOURCES_SERVICE, MCP_CLIENTS_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) => {
        const registry = scope.get<AiLibrarySourceRegistry>(
          AI_LIBRARY_SOURCES_SERVICE,
        );
        return scope.effect(() =>
          registry.register({
            id: "mcp",
            kind: "mcp",
            capability: scope.get<McpClientsCapability>(MCP_CLIENTS_SERVICE),
          }),
        );
      },
    );
    context.feature(
      {
        id: "workspace-files-source",
        label: "Workspace AI library discovery",
        requires: [AI_LIBRARY_SOURCES_SERVICE, WORKSPACE_FILES_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) => {
        const registry = scope.get<AiLibrarySourceRegistry>(
          AI_LIBRARY_SOURCES_SERVICE,
        );
        return scope.effect(() =>
          registry.register({
            id: "workspace-files",
            kind: "workspace-files",
            capability: scope.get<WorkspaceFilesCapability>(
              WORKSPACE_FILES_SERVICE,
            ),
          }),
        );
      },
    );
  },
};

export default plugin;
