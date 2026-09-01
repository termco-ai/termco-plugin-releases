import { MCP_CLIENTS_SERVICE } from "@termco/mcp-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(MCP_CLIENTS_SERVICE, createProcessServiceProxy<Services[typeof MCP_CLIENTS_SERVICE]>(MCP_CLIENTS_SERVICE, transport));
} };
export default plugin;
