import { AI_LIBRARY_SERVICE } from "@termco/ai-library-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";

const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(AI_LIBRARY_SERVICE, createProcessServiceProxy<Services[typeof AI_LIBRARY_SERVICE]>(AI_LIBRARY_SERVICE, transport));
} };
export default plugin;
