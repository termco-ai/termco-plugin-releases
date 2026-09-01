import type { LspSessionsCapability } from "@termco/editor-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginModule } from "@termco/kernel";
import { createLspContribution } from "./tools";
import { LSP_SESSIONS_SERVICE } from "@termco/editor-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    LSP_SESSIONS_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createLspContribution(
      context.get<LspSessionsCapability>("lsp.sessions"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
