import type { PluginModule } from "@termco/kernel";
import type {
  AiLiveCapability,
  AiLiveContributionRegistry,
} from "@termco/ai-live-base";
import { AiLiveRegistry } from "./registry";

const plugin: PluginModule = {
  activate(context) {
    const registry = new AiLiveRegistry();
    context.provide<AiLiveCapability>("ai.live", registry.live());
    context.provide<AiLiveContributionRegistry>(
      "ai.live-contributions",
      registry,
    );
  },
};

export default plugin;
