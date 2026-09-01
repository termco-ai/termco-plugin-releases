import { SHELL_EXECUTION_SERVICE } from "@termco/terminal-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

export function createRendererShellCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<Services[typeof SHELL_EXECUTION_SERVICE]>(
    SHELL_EXECUTION_SERVICE,
    transport,
  );
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      SHELL_EXECUTION_SERVICE,
      createRendererShellCapability(transport),
    );
  },
};

export default plugin;
