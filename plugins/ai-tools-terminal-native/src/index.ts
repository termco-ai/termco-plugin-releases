import type { PluginModule } from "@termco/kernel";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { ShellExecutionCapability } from "@termco/terminal-base";
import { TerminalToolSet } from "./tools";
import { SHELL_EXECUTION_SERVICE } from "@termco/terminal-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    SHELL_EXECUTION_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const tools = new TerminalToolSet(
      context.get<ShellExecutionCapability>("shell.execution"),
    );
    await context.effect(() => () => tools.dispose());
    const registry = context.get<AiToolRegistry>("ai.tools");
    for (const contribution of tools.contributions()) {
      await context.effect(() => registry.register(contribution));
    }
  },
};

export default plugin;
