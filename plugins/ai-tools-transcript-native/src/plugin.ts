import type { AiContextArtifactsCapability } from "@termco/ai-sessions-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { createTranscriptContribution } from "./tools";
import { AI_CONTEXT_ARTIFACTS_SERVICE } from "@termco/ai-sessions-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    AI_CONTEXT_ARTIFACTS_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createTranscriptContribution(
      context.get<AiContextArtifactsCapability>("ai.context-artifacts"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
