import type { PluginModule } from "@termco/kernel";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import {
  WORKSPACE_REGISTRY_SERVICE,
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspaceCapability,
  type WorkspaceRigsCapability,
  type WorkspaceTabsCapability,
  type WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { createWorkspaceEnvironmentCapability } from "./environment";

const plugin: PluginModule = {
  inject: [
    WORKSPACE_REGISTRY_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
  ],
  async activate(context) {
    const environment = await createWorkspaceEnvironmentCapability({
      workspace: context.get<WorkspaceCapability>("workspace.registry"),
      execution: context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
      rigs: context.get<WorkspaceRigsCapability>("workspace.rigs"),
      tabs: context.get<WorkspaceTabsCapability>("workspace.tabs"),
      terminalSessions:
        context.get<TerminalSessionsCapability>("terminal.sessions"),
      alert: (message) => window.alert(message),
    });
    context.provide("workspace.environment", environment);
  },
};

export default plugin;
