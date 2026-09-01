import { GIT_REPOSITORY_SERVICE } from "@termco/git-base";
import { createProcessServiceProxy, processTransportService, type PluginModule, type ProcessTransport, type Services } from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  context.provide(GIT_REPOSITORY_SERVICE, createProcessServiceProxy<Services[typeof GIT_REPOSITORY_SERVICE]>(GIT_REPOSITORY_SERVICE, transport));
} };
export default plugin;
