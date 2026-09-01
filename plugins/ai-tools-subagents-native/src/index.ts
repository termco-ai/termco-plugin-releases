import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type {
  AiToolRegistry,
  AiToolsetRegistry,
} from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { createSubagentContribution } from "./tools";
import { AI_INFERENCE_SERVICE } from "@termco/ai-inference-base";
import { AI_TOOLS_SERVICE, AI_TOOLSETS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    AI_INFERENCE_SERVICE,
    AI_TOOLSETS_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const inference = context.get<AiInferenceCapability>("ai.inference");
    const toolsets = context.get<AiToolsetRegistry>("ai.toolsets");
    const tools = context.get<AiToolRegistry>("ai.tools");
    await context.effect(() => {
      let removeContribution = () => {};
      const refresh = () => {
        removeContribution();
        const selected = toolsets
          .snapshot()
          .filter((entry) => entry.id === "fs" || entry.id === "search");
        removeContribution = tools.register(
          createSubagentContribution(inference, selected),
        );
      };
      refresh();
      const unsubscribe = toolsets.subscribe(refresh);
      return () => {
        unsubscribe();
        removeContribution();
      };
    });
  },
};

export default plugin;
