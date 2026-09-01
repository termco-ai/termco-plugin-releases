import type { GitCapability } from "@termco/git-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { createGitToolContribution } from "./tools";
import { GIT_REPOSITORY_SERVICE } from "@termco/git-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    GIT_REPOSITORY_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createGitToolContribution(
      context.get<GitCapability>("git.repository"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
