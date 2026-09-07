import type { AiLibrarySourceRegistry } from "@termco/ai-library-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { McpClientsCapability } from "@termco/mcp-base";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import { describe, expect, it, vi } from "vitest";
import { CapabilityRuntime, type PluginModule } from "@termco/kernel";
import manifest from "../termco-plugin.json";
import plugin, { createLibrary } from "./main";
import { createAiLibrarySources } from "./sources";

function harness() {
  const files = new Map<string, Map<string, unknown>>();
  const storage: StorageCapability = {
    async open(path) {
      const data = files.get(path) ?? new Map<string, unknown>();
      files.set(path, data);
      return {
        get: <T = unknown>(key: string) => data.get(key) as T | undefined,
        set: (key, value) => void data.set(key, structuredClone(value)),
        has: (key) => data.has(key),
        delete: (key) => data.delete(key),
        keys: () => [...data.keys()],
        values: () => [...data.values()],
        entries: () => [...data.entries()],
        clear: () => data.clear(),
        reset: () => data.clear(),
        save: async () => {},
      } satisfies StorageHandle;
    },
    async close() {},
  };
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const events: ApplicationEventsCapability = {
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    subscribe(event, listener) {
      const selected = listeners.get(event) ?? new Set();
      selected.add(listener);
      listeners.set(event, selected);
      return () => selected.delete(listener);
    },
    subscribeAll: () => () => {},
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
  const mcp: McpClientsCapability = {
    connect: vi.fn(async () => ({ ok: true as const, tools: [{ name: "read", inputSchema: {} }] })),
    disconnect: vi.fn(),
    clearOAuth: vi.fn(async () => {}),
    status: () => ({ connected: false, tools: [] }),
    call: vi.fn(async () => ({})),
    disconnectAll: vi.fn(),
    liveResources: () => [],
  };
  const workspaceFiles = {
    readFile: vi.fn(async () => ({ kind: "missing" })),
    readDir: vi.fn(async () => []),
    stat: vi.fn(async () => null),
  } as unknown as WorkspaceFilesCapability;
  return { files, storage, events, mcp, workspaceFiles };
}

describe("ai.library capability", () => {
  it("persists one shared catalogue and reconciles MCP through the selected provider", async () => {
    const h = harness();
    const { capability, dispose } = await createLibrary(
      h.storage,
      h.mcp,
      h.events,
      h.workspaceFiles,
    );
    const agent = {
      id: "a-team",
      name: "Team agent",
      description: "Company persona",
      instructions: "Use company conventions.",
      icon: "spark" as const,
      builtIn: false,
    };
    await capability.upsertAgent(agent);
    await capability.setActiveAgent(agent.id);
    await capability.upsertSnippet({
      id: "sn-review",
      handle: "review",
      name: "Review",
      description: "Review this change",
      content: "Review for correctness.",
    });
    const server = { name: "company", command: "company-mcp", args: [] };
    await capability.addMcpServers([server]);

    const snapshot = await capability.snapshot();
    expect(snapshot.activeAgentId).toBe(agent.id);
    expect(snapshot.agents).toContainEqual(agent);
    expect(snapshot.snippets).toHaveLength(1);
    expect(snapshot.mcpStatus.company).toMatchObject({ connected: true });
    expect(h.mcp.connect).toHaveBeenCalledExactlyOnceWith(server);
    expect(h.files.get("termco-ai-agents.json")?.get("customAgents")).toEqual([agent]);

    dispose();
  });
});


it.each([true, false])("connects saved MCP servers when the provider is ready (available at startup: %s)", async (availableAtStartup) => {
  const h = harness();
  const server = { name: "Telecontext", url: "https://example.test/mcp" };
    const disabledServer = { name: "Disabled", command: "disabled-mcp" };
  h.files.set("termco-ai-mcp.json", new Map<string, unknown>([
    ["userServers", [server, disabledServer]],
    ["userDisabled", [disabledServer.name]],
  ]));
  const mcpPlugin: PluginModule = { activate(context) { context.provide("mcp.clients", h.mcp); } };
  const runtime = new CapabilityRuntime({
    profileId: "test",
    plugins: [manifest, {...manifest, id: "test-mcp"}].map((entry) => ({ id: entry.id, manifest: entry, source: { type: "local", module: entry.id, location: entry.id, integrity: entry.id } })),
    activationOrder: [manifest.id, "test-mcp"],
  } as ConstructorParameters<typeof CapabilityRuntime>[0]);
  runtime.installExternalCapability("storage.application", "test-storage", h.storage);
  try {
    if (availableAtStartup) await runtime.activate("test-mcp", mcpPlugin);
    await runtime.activate(manifest.id, plugin);
    if (!availableAtStartup) {
      expect(h.mcp.connect).not.toHaveBeenCalled();
      expect(await runtime.callCapability("ai.library", "snapshot", [])).toMatchObject({mcpStatus: {}});
      await runtime.activate("test-mcp", mcpPlugin);
    }
    await vi.waitFor(() => expect(h.mcp.connect).toHaveBeenCalledWith(server));
    const state = await runtime.callCapability("ai.library", "snapshot", []);
    expect(state).toMatchObject({mcpStatus: {Telecontext: {connected: true}}});
    expect(h.mcp.connect).toHaveBeenCalledTimes(1);
    const registry = runtime.platformCapability<AiLibrarySourceRegistry>("ai.library.sources");
    const removeFiles = registry.register({id: "test-files", kind: "workspace-files", capability: h.workspaceFiles});
    removeFiles();
    expect(h.mcp.connect).toHaveBeenCalledTimes(1);
    await runtime.deactivate("test-mcp");
    expect(h.mcp.disconnect).toHaveBeenCalledWith(server.name);
    await runtime.activate("test-mcp", mcpPlugin);
    await vi.waitFor(() => expect(h.mcp.connect).toHaveBeenCalledTimes(2));
    expect(h.mcp.connect).not.toHaveBeenCalledWith(disabledServer);
  } finally {
    await runtime.disposeAll();
  }
});


it("ignores a connection result from a removed MCP source", async () => {
  const h = harness();
  const server = {name: "Saved", command: "saved-mcp"};
  h.files.set("termco-ai-mcp.json", new Map([["userServers", [server]]]));
  let finish!: (result: Awaited<ReturnType<McpClientsCapability["connect"]>>) => void;
  vi.mocked(h.mcp.connect).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const sources = createAiLibrarySources();
  const remove = sources.registry.register({id: "old", kind: "mcp", capability: h.mcp});
  const library = await createLibrary(h.storage, sources.mcp, h.events, h.workspaceFiles, sources.registry);
  try {
    remove();
    const replacement = harness().mcp;
    sources.registry.register({id: "new", kind: "mcp", capability: replacement});
    await vi.waitFor(async () => expect((await library.capability.snapshot()).mcpStatus.Saved.connected).toBe(true));
    finish({ok: true, tools: [{name: "stale", inputSchema: {}}]});
    await vi.waitFor(() => expect(h.mcp.disconnect).toHaveBeenCalledWith(server.name));
    expect((await library.capability.snapshot()).mcpStatus.Saved.tools).toEqual([{name: "read", inputSchema: {}}]);
  } finally {
    await library.dispose();
  }
});
