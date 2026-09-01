import type {
  AiLibraryDiscoveryResult,
  AiLibrarySourceContribution,
  AiLibrarySourceRegistry,
} from "@termco/ai-library-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { McpClientsCapability } from "@termco/mcp-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { discover } from "./discovery/discover";

function emptyDiscovery(
  root: string | null,
  workspace: WorkspaceEnv,
): AiLibraryDiscoveryResult {
  const dir = (root ?? "").replace(/\/+$/, "");
  const scopeKey =
    workspace?.kind === "ssh"
      ? `ssh:${workspace.connectionId}`
      : workspace?.kind === "wsl"
        ? `wsl:${workspace.distro}`
        : "local";
  return {
    root: dir,
    scopeKey,
    artifacts: [],
    counts: {
      memory: 0,
      skill: 0,
      agent: 0,
      command: 0,
      mcp: 0,
      rules: 0,
      settings: 0,
    },
  };
}

export function createAiLibrarySources(): {
  registry: AiLibrarySourceRegistry;
  mcp: McpClientsCapability;
  discover(
    root: string | null,
    workspace: WorkspaceEnv,
    refresh?: boolean,
  ): Promise<AiLibraryDiscoveryResult>;
} {
  let entries: readonly AiLibrarySourceContribution[] = [];
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const registry: AiLibrarySourceRegistry = {
    register(entry) {
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`AI library source "${entry.id}" is already registered`);
      }
      entries = [...entries, entry];
      publish();
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        entries = entries.filter((candidate) => candidate !== entry);
        publish();
      };
    },
    snapshot: () => [...entries],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const selectedMcp = () =>
    entries.find((entry) => entry.kind === "mcp")?.capability;
  const mcp: McpClientsCapability = {
    connect: (options) =>
      selectedMcp()?.connect(options) ??
      Promise.resolve({ error: "MCP library source is unavailable" }),
    disconnect: (name) => selectedMcp()?.disconnect(name),
    clearOAuth: async (name) => {
      await selectedMcp()?.clearOAuth(name);
    },
    status: (name) =>
      selectedMcp()?.status(name) ?? { connected: false, tools: [] },
    call: async (name, tool, args) => {
      const selected = selectedMcp();
      if (!selected) throw new Error("MCP library source is unavailable");
      return selected.call(name, tool, args);
    },
    disconnectAll: () => selectedMcp()?.disconnectAll(),
    liveResources: () => selectedMcp()?.liveResources() ?? [],
  };
  return {
    registry,
    mcp,
    async discover(root, workspace, refresh) {
      const files = entries.find(
        (
          entry,
        ): entry is Extract<
          AiLibrarySourceContribution,
          { kind: "workspace-files" }
        > => entry.kind === "workspace-files",
      )?.capability as WorkspaceFilesCapability | undefined;
      return files
        ? discover(files, root, workspace, refresh)
        : emptyDiscovery(root, workspace);
    },
  };
}
