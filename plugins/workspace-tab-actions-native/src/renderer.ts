import type { PluginModule } from "@termco/kernel";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import {
  WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspaceTabActionsCapability,
  type WorkspaceTabCloseGuardRegistry,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { createWorkspaceTabActions } from "./actions";

const plugin: PluginModule = {
  inject: [
    WORKSPACE_TABS_SERVICE,
    WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
  ],
  activate(context) {
    context.provide<WorkspaceTabActionsCapability>(
      "workspace.tab-actions",
      createWorkspaceTabActions({
        tabs: context.get<WorkspaceTabsCapability>("workspace.tabs"),
        terminalSessions:
          context.get<TerminalSessionsCapability>("terminal.sessions"),
        guards: context.get<WorkspaceTabCloseGuardRegistry>(
          WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
        ),
      }),
    );
  },
};

export default plugin;
