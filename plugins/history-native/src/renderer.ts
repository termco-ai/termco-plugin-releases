import { TERMINAL_HISTORY_SERVICE } from "@termco/terminal-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(TERMINAL_HISTORY_SERVICE, createProcessServiceProxy<Services[typeof TERMINAL_HISTORY_SERVICE]>(TERMINAL_HISTORY_SERVICE, transport));
} };
export default plugin;
