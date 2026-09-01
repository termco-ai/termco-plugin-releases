import type { PluginModule } from "@termco/kernel";
import {
  WORKSPACE_EXECUTION_BACKENDS_SERVICE,
  WORKSPACE_EXECUTION_SERVICE,
  type WorkspaceCapability,
} from "@termco/workspace-base";
import {
  createLocalWorkspaceExecutionBackend,
  createWorkspaceExecutionBackendRegistry,
  createWorkspaceExecutionCapability,
} from "./execution";
import { createWorkspaceCapability } from "./workspace";

const plugin: PluginModule = {
  async activate(context) {
    const capability: WorkspaceCapability = createWorkspaceCapability({
      platform: process.platform,
      argv: process.argv,
    });
    context.provide("workspace.registry", capability);
    const executionBackends = createWorkspaceExecutionBackendRegistry();
    context.provide(WORKSPACE_EXECUTION_BACKENDS_SERVICE, executionBackends);
    context.provide(
      WORKSPACE_EXECUTION_SERVICE,
      createWorkspaceExecutionCapability(executionBackends),
    );
    await context.effect(() =>
      executionBackends.register(createLocalWorkspaceExecutionBackend()),
    );
    await context.effect(() =>
      executionBackends.register(createLocalWorkspaceExecutionBackend("wsl")),
    );
  },
};

export default plugin;
