import { FORGE_REVIEWS_SERVICE, type ForgeReviewsCapability } from "@termco/forge-reviews-base";
import { GIT_REPOSITORY_SERVICE, type GitCapability } from "@termco/git-base";
import type { PluginModule } from "@termco/kernel";
import {
  WORKSPACE_EXECUTION_SERVICE,
  type WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { createForgeReviewsCapability } from "./provider";
import { createForgeCommandRunner } from "./runner";

const plugin: PluginModule = {
  inject: [GIT_REPOSITORY_SERVICE, WORKSPACE_EXECUTION_SERVICE],
  activate(context) {
    const capability: ForgeReviewsCapability = createForgeReviewsCapability({
      git: context.get<GitCapability>(GIT_REPOSITORY_SERVICE),
      runner: createForgeCommandRunner(
        context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
      ),
    });
    context.provide(FORGE_REVIEWS_SERVICE, capability);
  },
};

export default plugin;
