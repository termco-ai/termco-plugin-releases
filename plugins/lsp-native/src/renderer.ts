import { LSP_SESSIONS_SERVICE } from "@termco/editor-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(LSP_SESSIONS_SERVICE, createProcessServiceProxy<Services[typeof LSP_SESSIONS_SERVICE]>(LSP_SESSIONS_SERVICE, transport, { caller: true }));
} };
export default plugin;
