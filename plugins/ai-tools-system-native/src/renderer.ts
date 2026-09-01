import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import { createSystemToolContribution } from "./tools";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";
import { TERMINAL_HISTORY_SERVICE } from "@termco/terminal-base";

const plugin: PluginModule = {
  inject: [
    DESKTOP_INTEGRATION_SERVICE,
    TERMINAL_HISTORY_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createSystemToolContribution(
      context.get<DesktopIntegrationCapability>("desktop.integration"),
      context.get<ShellHistoryCapability>("terminal.history"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
