import { BROWSER_AUTOMATION_SERVICE } from "@termco/browser-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(BROWSER_AUTOMATION_SERVICE, createProcessServiceProxy<Services[typeof BROWSER_AUTOMATION_SERVICE]>(BROWSER_AUTOMATION_SERVICE, transport, { caller: true }));
} };
export default plugin;
