import type { PluginModule } from "@termco/kernel";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { WorkflowsLibraryCapability } from "@termco/workflows-base";
import { createWorkflowToolContribution } from "./tools";
import { WORKFLOWS_LIBRARY_SERVICE } from "@termco/workflows-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    WORKFLOWS_LIBRARY_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createWorkflowToolContribution(
      context.get<WorkflowsLibraryCapability>("workflows.library"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
