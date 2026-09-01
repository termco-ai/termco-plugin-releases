import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

export function createRendererFilesCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<Services[typeof WORKSPACE_FILES_SERVICE]>(
    WORKSPACE_FILES_SERVICE,
    transport,
  );
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      WORKSPACE_FILES_SERVICE,
      createRendererFilesCapability(transport),
    );
  },
};

export default plugin;
