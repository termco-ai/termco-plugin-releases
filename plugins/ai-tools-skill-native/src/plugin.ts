import type { AiLibraryCapability } from "@termco/ai-library-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { createSkillContribution } from "./tools";
import { AI_LIBRARY_SERVICE } from "@termco/ai-library-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    AI_LIBRARY_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createSkillContribution(
      context.get<AiLibraryCapability>("ai.library"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
