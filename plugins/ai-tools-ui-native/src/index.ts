import type { PluginModule } from "@termco/kernel";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";
import { createUiToolContribution } from "./tools";

const plugin: PluginModule = {
  inject: [AI_TOOLS_SERVICE],
  async activate(context) {
    const contribution = createUiToolContribution();
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
