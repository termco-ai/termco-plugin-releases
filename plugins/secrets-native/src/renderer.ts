import { SECRETS_APPLICATION_SERVICE } from "@termco/storage-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

export function createRendererSecretsCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<
    Services[typeof SECRETS_APPLICATION_SERVICE]
  >(SECRETS_APPLICATION_SERVICE, transport);
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      SECRETS_APPLICATION_SERVICE,
      createRendererSecretsCapability(transport),
    );
  },
};

export default plugin;
