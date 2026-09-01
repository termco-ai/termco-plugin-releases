import {
  AI_TOOLS_SERVICE,
  type AiToolRegistry,
} from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import {
  SESSION_MODEL_QUERY_SERVICE,
  type SessionModelQueryCapability,
} from "@termco/session-base";
import { createSessionQueryContribution } from "./tools";

const plugin: PluginModule = {
  inject: [SESSION_MODEL_QUERY_SERVICE, AI_TOOLS_SERVICE],
  async activate(context) {
    const contribution = createSessionQueryContribution(
      context.get<SessionModelQueryCapability>(SESSION_MODEL_QUERY_SERVICE),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>(AI_TOOLS_SERVICE).register(contribution),
    );
  },
};

export default plugin;
