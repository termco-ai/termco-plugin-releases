import type { AiLibraryCapability } from "@termco/ai-library-base";
import type { AiModelRegistry } from "@termco/ai-models-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";
import type {
  UiCommandRegistry,
  UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type {
  UiWorkspaceViewContribution,
  UiWorkspaceViewRegistry,
} from "@termco/ui-workspace-base";
import ui from "@termco/ui";
import { AgentsManagerView } from "./AgentsManagerView";
import { configureModels } from "./models";
import { configureLibraryRuntime } from "./runtime";
import { createAgentsViewState } from "./viewState";
import { AI_LIBRARY_SERVICE } from "@termco/ai-library-base";
import { AI_MODELS_SERVICE } from "@termco/ai-models-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";
import { UI_SETTINGS_VIEW_SERVICE } from "@termco/ui-settings-base";
import { UI_COMMANDS_SERVICE } from "@termco/ui-commands-base";
import { UI_WORKSPACE_VIEWS_SERVICE } from "@termco/ui-workspace-base";
import { createAgentsOnboardingContribution } from "./onboarding";

const state = createAgentsViewState();

function createView(
  agentsView: UiAgentsViewCapability,
  settingsView: UiSettingsViewCapability,
) {
  return function AgentsManagerWorkspace() {
    const agents = ui.React.useSyncExternalStore(
      agentsView.subscribe,
      agentsView.snapshot,
      agentsView.snapshot,
    );
    const settings = ui.React.useSyncExternalStore(
      settingsView.subscribe,
      settingsView.snapshot,
      settingsView.snapshot,
    );
    if (!agents.open || settings.open) return null;
    return (
      <div
        data-source-plugin="agents-manager-native"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          display: "flex",
          minHeight: 0,
          flexDirection: "column",
          background: "var(--background)",
        }}
      >
        <AgentsManagerView onClose={agentsView.close} />
      </div>
    );
  };
}

const plugin: PluginModule = {
  inject: [
    UI_SETTINGS_VIEW_SERVICE,
    AI_MODELS_SERVICE,
    AI_LIBRARY_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_COMMANDS_SERVICE,
    UI_WORKSPACE_VIEWS_SERVICE,
  ],
  optionalInject: [ONBOARDING_REGISTRY_SERVICE, ONBOARDING_RUNTIME_SERVICE],
  async activate(context) {
    const settingsView = context.get<UiSettingsViewCapability>("ui.settings-view");
    const view: UiAgentsViewCapability = {
      snapshot: state.snapshot,
      subscribe: state.subscribe,
      show() {
        settingsView.close();
        state.show();
      },
      close: state.close,
      toggle() {
        if (state.snapshot().open) state.close();
        else {
          settingsView.close();
          state.show();
        }
      },
    };
    const models = context.get<AiModelRegistry>("ai.models");
    contributeOnboarding(
      context,
      createAgentsOnboardingContribution(view),
      "Agents and AI library guidance",
    );
    context.feature(
      {
        id: "onboarding:agents-context",
        label: "Contextual Agents guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        let openSequence = view.snapshot().openSequence;
        return view.subscribe(() => {
          const next = view.snapshot();
          if (next.open && next.openSequence !== openSequence) {
            void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
              .suggest("agents-manager-native.choose-and-create");
          }
          openSequence = next.openSequence;
        });
      },
    );
    await context.effect(() => {
      let disposeModels = configureModels(models.snapshot());
      const unsubscribe = models.subscribe(() => {
        disposeModels();
        disposeModels = configureModels(models.snapshot());
      });
      return () => {
        unsubscribe();
        disposeModels();
      };
    });
    await context.effect(() =>
      configureLibraryRuntime(
        context.get<AiLibraryCapability>("ai.library"),
        context.get<PreferencesCapability>("settings.preferences"),
        context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      ),
    );
    const workspace: UiWorkspaceViewContribution = {
      id: "agents-manager",
      label: "Agents & Snippets",
      description: "Manage AI personas, snippets, skills, and MCP servers.",
      order: -5,
      Component: createView(view, settingsView),
    };
    const commands: UiCommandSourceContribution = {
      id: "agents-manager",
      commands: () => [
        {
          id: "agents-manager-open",
          title: "Manage agents, snippets, skills, and MCP servers",
          description: "Open the searchable application-wide AI library.",
          group: "AI",
          keywords: ["persona", "snippet", "skill", "mcp", "library"],
          run: view.show,
        },
      ],
    };
    context.provide("ui.agents-view", view);
    await context.effect(() =>
      context
        .get<UiWorkspaceViewRegistry>("ui.workspace.views")
        .register(workspace, { pluginId: "agents-manager-native", generation: context.generation, key: workspace.id }),
    );
    await context.effect(() =>
      context.get<UiCommandRegistry>("ui.commands").register(commands, {
        pluginId: "agents-manager-native",
        generation: context.generation,
        key: commands.id,
      }),
    );
  },
};

export default plugin;
