import {
  AI_TOOL_EXECUTION_SERVICE,
  AI_TOOLS_SERVICE,
  AI_TOOLSETS_SERVICE,
  type AiToolExecutionCapability,
} from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import {
  SESSION_HISTORY_SERVICE,
  type SessionHistoryCapability,
} from "@termco/session-base";
import { createAiToolExecutor } from "./executor";
import { createAiRegistries } from "./registry";

const E2E_MARKER = "ai-registry-v1";

const plugin: PluginModule = {
  inject: [SESSION_HISTORY_SERVICE],
  async activate(context) {
    const { tools, toolsets } = createAiRegistries();
    const execution: AiToolExecutionCapability = createAiToolExecutor({
      history: context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
    });
    context.provide(AI_TOOLS_SERVICE, tools);
    context.provide(AI_TOOLSETS_SERVICE, toolsets);
    context.provide(AI_TOOL_EXECUTION_SERVICE, execution);
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    if (host.__termco?.e2e) {
      const seam = (host.__termcoE2E ??= {});
      const marker = () => E2E_MARKER;
      seam.aiRegistryProviderMarker = marker;
      await context.effect(() => () => {
        if (seam.aiRegistryProviderMarker === marker) {
          delete seam.aiRegistryProviderMarker;
        }
      });
    }
  },
};

export default plugin;
