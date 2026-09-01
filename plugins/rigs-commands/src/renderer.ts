import type { PluginModule } from "@termco/kernel";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandRegistry,
  type UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import {
  WORKSPACE_RIGS_OVERVIEW_SERVICE,
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_RIG_WORKFLOWS_SERVICE,
  type WorkspaceRigOverviewCapability,
  type WorkspaceRigWorkflowsCapability,
  type WorkspaceRigsCapability,
} from "@termco/workspace-base";
import { rigCreationCommand, rigNavigationCommands } from "./commands";

const plugin: PluginModule = {
  inject: [UI_COMMANDS_SERVICE],
  optionalInject: [
    WORKSPACE_RIGS_SERVICE,
    WORKSPACE_RIGS_OVERVIEW_SERVICE,
    WORKSPACE_RIG_WORKFLOWS_SERVICE,
  ],
  activate(context) {
    context.feature(
      {
        id: "navigation-commands",
        label: "Rig navigation commands",
        requires: [WORKSPACE_RIGS_SERVICE, WORKSPACE_RIGS_OVERVIEW_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const workspaceRigs = scope.get<WorkspaceRigsCapability>(
          WORKSPACE_RIGS_SERVICE,
        );
        const rigOverview = scope.get<WorkspaceRigOverviewCapability>(
          WORKSPACE_RIGS_OVERVIEW_SERVICE,
        );
        const source: UiCommandSourceContribution = {
          id: "rigs",
          order: 60,
          subscribe: (listener) => workspaceRigs.subscribe(listener),
          commands: () => rigNavigationCommands(workspaceRigs, rigOverview),
        };
        return scope.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(source, {
          pluginId: "rigs-commands",
          generation: context.generation,
          key: source.id,
        });
      },
    );

    context.feature(
      {
        id: "creation-command",
        label: "Rig creation command",
        requires: [WORKSPACE_RIG_WORKFLOWS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const command = rigCreationCommand(
          scope.get<WorkspaceRigWorkflowsCapability>(
            WORKSPACE_RIG_WORKFLOWS_SERVICE,
          ),
        );
        return scope.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(command, {
          pluginId: "rigs-commands",
          generation: context.generation,
          key: command.id,
        });
      },
    );
  },
};

export default plugin;
