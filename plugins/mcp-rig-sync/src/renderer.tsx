import type { PluginModule } from "@termco/kernel";
import type { McpServerCapability } from "@termco/mcp-base";
import type {
  UiBackgroundContribution,
  UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import ui from "@termco/ui";
import { mcpRigs } from "./model";
import { MCP_SERVER_SERVICE } from "@termco/mcp-base";
import { WORKSPACE_RIGS_SERVICE } from "@termco/workspace-base";
import { UI_BACKGROUND_TASKS_SERVICE } from "@termco/ui-shell-base";

const { useEffect, useSyncExternalStore } = ui.React;

function createBackground(
  server: McpServerCapability,
  workspaceRigs: WorkspaceRigsCapability,
) {
  return function McpRigSync() {
    const snapshot = useSyncExternalStore(
      (listener) => workspaceRigs.subscribe(listener),
      () => workspaceRigs.snapshot(),
      () => workspaceRigs.snapshot(),
    );
    const rigs = mcpRigs(snapshot.rigs);
    const signature = rigs.map((rig) => `${rig.id}\u0000${rig.name}\u0000${rig.root}`).join("\u0001");
    useEffect(() => {
      if (!snapshot.hydrated) return;
      void server.syncRigs(rigs).catch(() => {});
    }, [snapshot.hydrated, signature]);
    return null;
  };
}

const plugin: PluginModule = {
  inject: [
    MCP_SERVER_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    UI_BACKGROUND_TASKS_SERVICE,
  ],
  async activate(context) {
    const contribution: UiBackgroundContribution = {
      id: "mcp-rig-sync",
      label: "MCP workspace mirror",
      description: "Keeps workspace rigs synchronized with the shared MCP control server.",
      Component: createBackground(
        context.get<McpServerCapability>("mcp.server"),
        context.get<WorkspaceRigsCapability>("workspace.rigs"),
      ),
    };
    await context.effect(() =>
      context
        .get<UiBackgroundRegistry>("ui.background.tasks")
        .register(contribution, { pluginId: "mcp-rig-sync", generation: context.generation, key: contribution.id }),
    );
  },
};

export default plugin;
