import { AI_CONTEXT_ARTIFACTS_SERVICE } from "@termco/ai-sessions-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      AI_CONTEXT_ARTIFACTS_SERVICE,
      createProcessServiceProxy<Services[typeof AI_CONTEXT_ARTIFACTS_SERVICE]>(
        AI_CONTEXT_ARTIFACTS_SERVICE,
        transport,
      ),
    );
  },
};

export default plugin;
