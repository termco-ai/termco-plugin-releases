import type {
  AiLibraryAgent,
  AiLibraryCapability,
  AiLibrarySnapshot,
} from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import { AI_LIBRARY_EVENTS } from "@termco/ai-library-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureAgentsStore,
  mcpToolsFor,
  useAgentsStore,
} from "./agentsStore";

const coder: AiLibraryAgent = {
  id: "builtin:coder",
  name: "Coder",
  description: "Builds",
  instructions: "Build it",
  icon: "coder",
  builtIn: true,
};
const pluginCreator: AiLibraryAgent = {
  id: "builtin:plugin-creator",
  name: "Plugin Creator",
  description: "Builds plugins",
  instructions: "Use plugin tools",
  icon: "spark",
  builtIn: true,
  preferredToolGroups: ["plugin-dev", "files"],
};

function snapshot(agents = [coder, pluginCreator]): AiLibrarySnapshot {
  return {
    agents,
    customAgents: agents.filter((agent) => !agent.builtIn),
    activeAgentId: agents[0]?.id ?? "",
    snippets: [],
    skills: [],
    disabledSkillIds: [],
    enabledProjectSkills: {},
    enabledMcpServers: {},
    userMcpServers: [],
    disabledUserMcpServers: [],
    mcpStatus: {},
  };
}

function harness(initial = snapshot()) {
  let current = initial;
  const listeners = new Set<(payload: unknown) => void>();
  const library = {
    snapshot: vi.fn(async () => structuredClone(current)),
    setActiveAgent: vi.fn(async () => {}),
    upsertAgent: vi.fn(async () => {}),
    removeAgent: vi.fn(async () => {}),
  } as unknown as AiLibraryCapability;
  const events = {
    subscribe: vi.fn((_event, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  } as unknown as ApplicationEventsCapability;
  return {
    library,
    events,
    replace(next: AiLibrarySnapshot) {
      current = next;
      for (const listener of listeners) listener(null);
    },
  };
}

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  useAgentsStore.setState({
    hydrated: false,
    agents: [],
    customAgents: [],
    activeId: "",
  });
});

describe("chat agent library adapter", () => {
  it("uses the provider's complete catalogue including Plugin Creator", async () => {
    const h = harness();
    dispose = await configureAgentsStore(h.library, h.events);

    expect(useAgentsStore.getState().all().map((agent) => agent.name)).toEqual([
      "Coder",
      "Plugin Creator",
    ]);
    expect(h.events.subscribe).toHaveBeenCalledWith(
      AI_LIBRARY_EVENTS.changed,
      expect.any(Function),
    );
  });

  it("refreshes when a replacement provider publishes a changed catalogue", async () => {
    const h = harness();
    dispose = await configureAgentsStore(h.library, h.events);

    h.replace(snapshot([{ ...coder, name: "Company Coder" }]));
    await vi.waitFor(() =>
      expect(useAgentsStore.getState().agents[0]?.name).toBe("Company Coder"),
    );
  });

  it("writes active selection through the selected provider", async () => {
    const h = harness();
    dispose = await configureAgentsStore(h.library, h.events);

    useAgentsStore.getState().setActiveId(pluginCreator.id);

    expect(h.library.setActiveAgent).toHaveBeenCalledWith(pluginCreator.id);
  });

  it("resolves connected global and workspace MCP tools from the selected library", async () => {
    const value = snapshot();
    value.userMcpServers = [{ name: "global", command: "global-mcp" }];
    value.enabledMcpServers = { "ssh:rig-a::/repo": ["workspace"] };
    value.mcpStatus = {
      global: {
        connecting: false,
        connected: true,
        tools: [{ name: "read", inputSchema: { type: "object" } }],
      },
      workspace: {
        connecting: false,
        connected: true,
        tools: [{ name: "deploy", inputSchema: { type: "object" } }],
      },
      disconnected: {
        connecting: false,
        connected: false,
        tools: [{ name: "hidden", inputSchema: { type: "object" } }],
      },
    };
    const h = harness(value);
    dispose = await configureAgentsStore(h.library, h.events);

    expect(mcpToolsFor("/repo/", {
      kind: "ssh",
      connectionId: "rig-a",
      host: "rig-a.example",
    }))
      .toEqual([
        {
          server: "global",
          tool: { name: "read", inputSchema: { type: "object" } },
        },
        {
          server: "workspace",
          tool: { name: "deploy", inputSchema: { type: "object" } },
        },
      ]);
  });
});
