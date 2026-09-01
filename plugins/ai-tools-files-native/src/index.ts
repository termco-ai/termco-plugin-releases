import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { AiToolRegistry, AiToolsetRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { FileToolSet } from "./tools";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { AI_TOOLS_SERVICE, AI_TOOLSETS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    WORKSPACE_FILES_SERVICE,
    AI_TOOLS_SERVICE,
    AI_TOOLSETS_SERVICE,
  ],
  async activate(context) {
    const tools = new FileToolSet(
      context.get<WorkspaceFilesCapability>("workspace.files"),
    );
    const toolRegistry = context.get<AiToolRegistry>("ai.tools");
    const toolsetRegistry = context.get<AiToolsetRegistry>("ai.toolsets");
    for (const contribution of tools.contributions()) {
      await context.effect(() => toolRegistry.register(contribution));
      if (contribution.id === "fs" || contribution.id === "search") {
        await context.effect(() => toolsetRegistry.register(contribution));
      }
    }
  },
};

export default plugin;
