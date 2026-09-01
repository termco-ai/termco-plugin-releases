import type { PluginModule } from "@termco/kernel";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { McpClientsCapability } from "@termco/mcp-base";
import { createMcpToolContribution } from "./tools";
import { MCP_CLIENTS_SERVICE } from "@termco/mcp-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";

const plugin: PluginModule = {
  inject: [
    MCP_CLIENTS_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  async activate(context) {
    const contribution = createMcpToolContribution(
      context.get<McpClientsCapability>("mcp.clients"),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
