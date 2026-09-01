import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { McpClientsCapability } from "@termco/mcp-base";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";
import { describe, expect, it, vi } from "vitest";
import { createLibrary } from "./main";

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
