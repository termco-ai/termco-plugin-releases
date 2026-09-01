import { STORAGE_APPLICATION_SERVICE } from "@termco/storage-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

export function createRendererStorageCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<Services[typeof STORAGE_APPLICATION_SERVICE]>(
    STORAGE_APPLICATION_SERVICE,
    transport,
  );
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      STORAGE_APPLICATION_SERVICE,
      createRendererStorageCapability(transport),
    );
  },
};

export default plugin;
