import type { PluginModule } from "@termco/kernel";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import {
  WORKSPACE_ENVIRONMENT_SERVICE,
  WORKSPACE_EXECUTION_SERVICE,
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspaceEnvironmentCapability,
  type WorkspaceRigsCapability,
  type WorkspaceTabsCapability,
  type WorkspaceExecutionCapability,
} from "@termco/workspace-base";
import { toast } from "sonner";
import { createRigWorkflows } from "./workflows";

const plugin: PluginModule = {
  inject: [
    WORKSPACE_RIGS_SERVICE,
    WORKSPACE_ENVIRONMENT_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
  ],
  activate(context) {
    context.provide(
      "workspace.rig-workflows",
      createRigWorkflows({
        rigs: context.get<WorkspaceRigsCapability>("workspace.rigs"),
        environment: context.get<WorkspaceEnvironmentCapability>(
          "workspace.environment",
        ),
        tabs: context.get<WorkspaceTabsCapability>("workspace.tabs"),
        terminalSessions:
          context.get<TerminalSessionsCapability>("terminal.sessions"),
        execution: context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
        notifyError: (title, description) =>
          toast.error(title, { description }),
      }),
    );
  },
};

export default plugin;
