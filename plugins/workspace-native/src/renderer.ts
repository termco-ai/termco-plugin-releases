import {
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_REGISTRY_SERVICE,
} from "@termco/workspace-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

export function createRendererWorkspaceCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<Services[typeof WORKSPACE_REGISTRY_SERVICE]>(
    WORKSPACE_REGISTRY_SERVICE,
    transport,
  );
}

export function createRendererWorkspaceExecutionCapability(transport: ProcessTransport) {
  return createProcessServiceProxy<Services[typeof WORKSPACE_EXECUTION_SERVICE]>(
    WORKSPACE_EXECUTION_SERVICE,
    transport,
  );
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      WORKSPACE_REGISTRY_SERVICE,
      createRendererWorkspaceCapability(transport),
    );
    context.provide(
      WORKSPACE_EXECUTION_SERVICE,
      createRendererWorkspaceExecutionCapability(transport),
    );
  },
};

export default plugin;
