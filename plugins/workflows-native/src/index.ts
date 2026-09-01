import { CONTAINERS_RUNTIME_SERVICE, type ContainersCapability } from "@termco/containers-base";
import { AI_SESSIONS_SERVICE, type AiSessionsCapability } from "@termco/ai-sessions-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { GIT_REPOSITORY_SERVICE, type GitCapability } from "@termco/git-base";
import type { Dispose, PluginModule } from "@termco/kernel";
import {
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRegistry,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import { SSH_CLIENT_SERVICE, type SshClientCapability } from "@termco/ssh-base";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import { UI_COMMANDS_SERVICE, type UiCommandRegistry } from "@termco/ui-commands-base";
import { UI_AI_DOCK_VIEWS_SERVICE, type UiAiDockViewRegistry } from "@termco/ui-dock-base";
import { UI_OVERLAYS_SERVICE, type UiOverlayRegistry } from "@termco/ui-overlays-base";
import {
  WORKFLOWS_DEFINITIONS_SERVICE,
  WORKFLOWS_LIBRARY_SERVICE,
  WORKFLOWS_PARAMETER_SOURCES_SERVICE,
  WORKFLOWS_RUNNERS_SERVICE,
  type WorkflowDefinitionsRegistry,
  type WorkflowParameterSourceRegistry,
  type WorkflowRunnerRegistry,
  type WorkflowsLibraryCapability,
} from "@termco/workflows-base";
import {
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspacePresentationCapability,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import {
  builtinDefinitions,
  containerParameterSource,
  containerRunner,
  gitParameterSource,
  sshParameterSource,
  sshRunner,
  terminalRunner,
} from "./adapters";
import { createWorkflowsLibrary } from "./library";
import {
  createWorkflowDefinitionsRegistry,
  createWorkflowParameterSourceRegistry,
  createWorkflowRunnerRegistry,
} from "./registry";
import {
  createWorkflowCommands,
  createWorkflowDock,
  createWorkflowOverlay,
} from "./renderer";
import { createWorkflowSheetController } from "./sheet";
import {
  configureWorkflowOnboardingSuggestion,
  createWorkflowsOnboardingContribution,
} from "./onboarding";

function disposeTogether(disposers: Dispose[]): Dispose {
  return async () => {
    for (const dispose of [...disposers].reverse()) await dispose();
  };
}

const plugin: PluginModule = {
  optionalInject: [
    ONBOARDING_REGISTRY_SERVICE,
    ONBOARDING_RUNTIME_SERVICE,
    AI_SESSIONS_SERVICE,
  ],
  async activate(context) {
    const definitions = createWorkflowDefinitionsRegistry();
    const runners = createWorkflowRunnerRegistry();
    const parameterSources = createWorkflowParameterSourceRegistry();
    context.provide<WorkflowDefinitionsRegistry>(
      WORKFLOWS_DEFINITIONS_SERVICE,
      definitions,
    );
    context.provide<WorkflowRunnerRegistry>(WORKFLOWS_RUNNERS_SERVICE, runners);
    context.provide<WorkflowParameterSourceRegistry>(
      WORKFLOWS_PARAMETER_SOURCES_SERVICE,
      parameterSources,
    );
    await context.effect(() => definitions.register(builtinDefinitions("core")));

    const owned = await createWorkflowsLibrary(
      null,
      null,
      definitions,
      runners,
      false,
    );
    await context.effect(() => owned.dispose);
    context.provide<WorkflowsLibraryCapability>(
      WORKFLOWS_LIBRARY_SERVICE,
      owned.capability,
    );
    const sheet = createWorkflowSheetController();

    context.feature(
      {
        id: "onboarding:workflows-guidance",
        label: "Workflow guidance",
        requires: [ONBOARDING_REGISTRY_SERVICE, AI_SESSIONS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const contribution = createWorkflowsOnboardingContribution(
          scope.get<AiSessionsCapability>(AI_SESSIONS_SERVICE),
        );
        return scope.get<OnboardingRegistry>(ONBOARDING_REGISTRY_SERVICE).register(
          contribution,
          {
            pluginId: context.pluginId,
            generation: context.generation,
            key: contribution.id,
          },
        );
      },
    );
    context.feature(
      {
        id: "onboarding:workflows-context",
        label: "Contextual Workflow guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => configureWorkflowOnboardingSuggestion(() => {
        void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
          .suggest("workflows-native.create-and-run");
      }),
    );

    context.feature(
      {
        id: "persistence",
        label: "Workflow persistence",
        requires: [SETTINGS_PREFERENCES_SERVICE, EVENTS_APPLICATION_SERVICE],
        uiPolicy: "fallback",
      },
      async (scope) =>
        owned.bindPersistence(
          scope.get<PreferencesCapability>(SETTINGS_PREFERENCES_SERVICE),
          scope.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
        ),
    );

    context.feature(
      {
        id: "git-contributions",
        label: "Git workflows and parameters",
        requires: [GIT_REPOSITORY_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const git = scope.get<GitCapability>(GIT_REPOSITORY_SERVICE);
        return disposeTogether([
          definitions.register(builtinDefinitions("git")),
          parameterSources.register(gitParameterSource(git)),
        ]);
      },
    );

    context.feature(
      {
        id: "terminal-runner",
        label: "Terminal workflow runner",
        requires: [WORKSPACE_TABS_SERVICE, TERMINAL_SESSIONS_SERVICE],
        uiPolicy: "structured-unavailable",
      },
      (scope) =>
        runners.register(
          terminalRunner(
            scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
            scope.get<TerminalSessionsCapability>(TERMINAL_SESSIONS_SERVICE),
          ),
        ),
    );

    context.feature(
      {
        id: "container-contributions",
        label: "Container workflows, runner, and parameters",
        requires: [
          CONTAINERS_RUNTIME_SERVICE,
          WORKSPACE_TABS_SERVICE,
          TERMINAL_SESSIONS_SERVICE,
        ],
        uiPolicy: "remove",
      },
      (scope) => {
        const containers = scope.get<ContainersCapability>(CONTAINERS_RUNTIME_SERVICE);
        const tabs = scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE);
        const terminals = scope.get<TerminalSessionsCapability>(TERMINAL_SESSIONS_SERVICE);
        return disposeTogether([
          definitions.register(builtinDefinitions("containers")),
          runners.register(containerRunner(containers, tabs, terminals)),
          parameterSources.register(containerParameterSource(containers)),
        ]);
      },
    );

    context.feature(
      {
        id: "ssh-contributions",
        label: "SSH workflows, runner, and parameters",
        requires: [SSH_CLIENT_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const ssh = scope.get<SshClientCapability>(SSH_CLIENT_SERVICE);
        return disposeTogether([
          definitions.register(builtinDefinitions("ssh")),
          runners.register(sshRunner(ssh)),
          parameterSources.register(sshParameterSource(ssh)),
        ]);
      },
    );

    context.feature(
      {
        id: "dock-placement",
        label: "Workflow dock",
        requires: [UI_AI_DOCK_VIEWS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const dock = createWorkflowDock(owned.capability, sheet);
        return scope.get<UiAiDockViewRegistry>(UI_AI_DOCK_VIEWS_SERVICE).register(
          dock,
          {
            pluginId: context.pluginId,
            generation: context.generation,
            key: dock.id,
          },
        );
      },
    );

    context.feature(
      {
        id: "command-placement",
        label: "Workflow commands",
        requires: [UI_COMMANDS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const commands = createWorkflowCommands(owned.capability, sheet);
        return scope.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(
          commands,
          {
            pluginId: context.pluginId,
            generation: context.generation,
            key: commands.id,
          },
        );
      },
    );

    context.feature(
      {
        id: "run-sheet-placement",
        label: "Workflow run sheet",
        requires: [WORKSPACE_PRESENTATION_SERVICE, UI_OVERLAYS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const overlay = createWorkflowOverlay(owned.capability, sheet, {
          presentation: scope.get<WorkspacePresentationCapability>(
            WORKSPACE_PRESENTATION_SERVICE,
          ),
          runners,
          parameterSources,
        });
        return scope.get<UiOverlayRegistry>(UI_OVERLAYS_SERVICE).register(
          overlay,
          {
            pluginId: context.pluginId,
            generation: context.generation,
            key: overlay.id,
          },
        );
      },
    );
  },
};

export default plugin;
