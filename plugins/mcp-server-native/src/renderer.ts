import { MCP_SERVER_SERVICE } from "@termco/mcp-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(MCP_SERVER_SERVICE, createProcessServiceProxy<Services[typeof MCP_SERVER_SERVICE]>(MCP_SERVER_SERVICE, transport, { caller: true }));
} };
export default plugin;
