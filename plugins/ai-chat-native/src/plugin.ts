import type { AgentActivityControlCapability } from "@termco/agents-base";
import type {
  AiInferenceCapability,
  AiSpeechCapability,
} from "@termco/ai-inference-base";
import type { AiLibraryCapability } from "@termco/ai-library-base";
import type { AiLiveCapability } from "@termco/ai-live-base";
import type { AiModelRegistry } from "@termco/ai-models-base";
import {
  AI_SESSIONS_SERVICE,
  type AiSessionsCapability,
  type AiSessionsHostControl,
} from "@termco/ai-sessions-base";
import type {
  AiBrowserPolicyCapability,
  AiToolExecutionCapability,
  AiToolRegistry,
} from "@termco/ai-tools-base";
import {
  AI_BROWSER_POLICY_SERVICE,
  AI_TOOL_EXECUTION_SERVICE,
  AI_TOOLS_SERVICE,
  AI_TOOLSETS_SERVICE,
} from "@termco/ai-tools-base";
import type { EditorNavigationCapability } from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  WorkspaceFileIconsCapability,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type {
  PreferencesCapability,
  StorageCapability,
} from "@termco/storage-base";
import type { SessionHistoryCapability } from "@termco/session-base";
import type { TrajectoryNavigationCapability } from "@termco/trajectory-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";
import type {
  UiAiDockViewRegistry,
  UiDockSurfaceRegistry,
} from "@termco/ui-dock-base";
import type { UiOverlayRegistry } from "@termco/ui-overlays-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type {
  UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import type { UiTabKindRegistry } from "@termco/ui-tabs-base";
import type {
  UiWorkspaceComposerCapability,
  UiWorkspaceComposerHostControl,
  UiWorkspaceFooterRegistry,
} from "@termco/ui-workspace-base";
import type {
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { configureSessionRuntime, selectedDefaultModelId } from "./runtime";
import { bootstrapSessions } from "./bootstrap";
import { aiSessionsCapability, useChatStore } from "./store/store";
import { chats, seedMessages, toolContexts } from "./store/registry";
import {
  configureChatRuntime,
  sendOwnedUiMessage,
  stopOwnedChat,
} from "./chatRuntime";
import {
  aiDockContribution,
  createAiBackgroundContribution,
  createAiOverlayContribution,
} from "./ui/AiSurfaces";
import { configureAiUiPreferences } from "./baseline/runtime/preferences";
import { configureSettingsNavigation } from "./baseline/runtime/settings";
import { configureBrowserPolicy } from "./baseline/runtime/browserPolicy";
import { configureFileIcons } from "./baseline/runtime/fileIcons";
import { configureAgentsView } from "./baseline/runtime/agentsView";
import { configureNativeFiles } from "./baseline/lib/native/native";
import { configurePlatformRuntime } from "./baseline/runtime/platform";
import { configureLocalAgentNotifications } from "./baseline/runtime/localAgentNotifications";
import { configureToolContributions } from "./baseline/runtime/toolContributions";
import { configureDockIntegrations } from "./baseline/runtime/dockIntegrations";
import {
  createAiConnectFooterContribution,
  workspaceComposerCapability,
} from "./ui/WorkspaceComposer";
import { configureEditorNavigation } from "./baseline/runtime/navigation";
import { configureAgentsStore } from "./baseline/store/agentsStore";
import { configureSpeechCapability } from "./baseline/lib/stt";
import { configureCompactionRuntime } from "./baseline/runtime/compactionRuntime";
import { AGENTS_ACTIVITY_CONTROL_SERVICE } from "@termco/agents-base";
import {
  AI_INFERENCE_SERVICE,
  AI_SPEECH_SERVICE,
} from "@termco/ai-inference-base";
import { AI_LIBRARY_SERVICE } from "@termco/ai-library-base";
import { AI_LIVE_SERVICE } from "@termco/ai-live-base";
import { AI_MODELS_SERVICE } from "@termco/ai-models-base";
import { EDITOR_NAVIGATION_SERVICE } from "@termco/editor-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import {
  WORKSPACE_FILE_ICONS_SERVICE,
  WORKSPACE_FILES_SERVICE,
} from "@termco/files-base";
import {
  SETTINGS_PREFERENCES_SERVICE,
  STORAGE_APPLICATION_SERVICE,
} from "@termco/storage-base";
import { SESSION_HISTORY_SERVICE } from "@termco/session-base";
import { TRAJECTORY_NAVIGATION_SERVICE } from "@termco/trajectory-base";
import { UI_AGENTS_VIEW_SERVICE } from "@termco/ui-agents-base";
import {
  UI_AI_DOCK_VIEWS_SERVICE,
  UI_DOCK_SURFACES_SERVICE,
} from "@termco/ui-dock-base";
import { UI_OVERLAYS_SERVICE } from "@termco/ui-overlays-base";
import { UI_SETTINGS_VIEW_SERVICE } from "@termco/ui-settings-base";
import {
  UI_BACKGROUND_TASKS_SERVICE,
} from "@termco/ui-shell-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";
import {
  UI_WORKSPACE_COMPOSER_SERVICE,
  UI_WORKSPACE_FOOTER_SERVICE,
} from "@termco/ui-workspace-base";
import {
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_TABS_SERVICE,
} from "@termco/workspace-base";
import {
  createChatOnboardingContribution,
  subscribeToFirstChatUse,
} from "./onboarding";

const plugin: PluginModule = {
  replacementImpact() {
    const sessions = useChatStore.getState().sessions;
    return [
      {
        capability: "ai.sessions",
        resourceLabel: "active AI sessions",
        resources: [...chats.keys()].map((id) => ({
          id,
          label: sessions.find((session) => session.id === id)?.title ?? id,
        })),
      },
    ];
  },
  inject: [
    AI_TOOLS_SERVICE,
    AI_TOOL_EXECUTION_SERVICE,
    AI_TOOLSETS_SERVICE,
    AI_SESSIONS_SERVICE,
    UI_WORKSPACE_COMPOSER_SERVICE,
    AI_LIVE_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    AI_MODELS_SERVICE,
    SESSION_HISTORY_SERVICE,
    EVENTS_APPLICATION_SERVICE,
  ],
  optionalInject: [
    AI_BROWSER_POLICY_SERVICE,
    TRAJECTORY_NAVIGATION_SERVICE,
    WORKSPACE_FILE_ICONS_SERVICE,
    ONBOARDING_REGISTRY_SERVICE,
    ONBOARDING_RUNTIME_SERVICE,
  ],
  async activate(context) {
    const onboarding = createChatOnboardingContribution();
    contributeOnboarding(context, onboarding, "AI Chat guidance");
    context.feature(
      {
        id: "onboarding:chat-context",
        label: "Contextual AI Chat guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => subscribeToFirstChatUse(() => {
        void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
          .suggest("ai-chat-native.first-request");
      }),
    );
    const tools = context.get<AiToolRegistry>("ai.tools");
    const toolExecution = context.get<AiToolExecutionCapability>(
      AI_TOOL_EXECUTION_SERVICE,
    );
    const aiLive = context.get<AiLiveCapability>("ai.live");
    const previousLive = useChatStore.getState().live;
    await context.effect(() => {
      useChatStore.getState().setLive(aiLive);
      return () => {
        if (useChatStore.getState().live === aiLive) {
          useChatStore.getState().setLive(previousLive);
        }
      };
    });
    await context.effect(() => async () => {
      await Promise.allSettled(
        [...chats.keys()].map((sessionId) => stopOwnedChat(sessionId)),
      );
      chats.clear();
      seedMessages.clear();
      toolContexts.clear();
    });
    const preferences = context.get<PreferencesCapability>("settings.preferences");
    const workspaceRigs = context.get<WorkspaceRigsCapability>("workspace.rigs");
    const modelRegistry = context.get<AiModelRegistry>("ai.models");
    const models = modelRegistry.snapshot();
    await context.effect(() => {
      let disposeModels = configureSessionRuntime({
        preferences,
        history: context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
        models: modelRegistry.snapshot(),
        sendMessage: sendOwnedUiMessage,
      });
      const unsubscribe = modelRegistry.subscribe(() => {
        disposeModels();
        disposeModels = configureSessionRuntime({
          preferences,
          history: context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
          models: modelRegistry.snapshot(),
          sendMessage: sendOwnedUiMessage,
        });
      });
      return () => {
        unsubscribe();
        disposeModels();
      };
    });
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    await context.effect(() => configureAiUiPreferences(preferences, events));
    context.feature(
      {
        id: "library-source",
        label: "AI library personas and skills",
        requires: [AI_LIBRARY_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) =>
        scope.effect(() =>
          configureAgentsStore(
            scope.get<AiLibraryCapability>(AI_LIBRARY_SERVICE),
            events,
          ),
        ),
    );
    context.feature(
      {
        id: "settings-navigation",
        label: "AI settings navigation",
        requires: [UI_SETTINGS_VIEW_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          configureSettingsNavigation(
            scope.get<UiSettingsViewCapability>(UI_SETTINGS_VIEW_SERVICE),
          ),
        ),
    );
    const browserPolicy = context.observe<AiBrowserPolicyCapability>(
      AI_BROWSER_POLICY_SERVICE,
    );
    await context.effect(() => {
      let disposePolicy = configureBrowserPolicy(browserPolicy.current() ?? null);
      const unsubscribe = browserPolicy.subscribe(() => {
        disposePolicy();
        disposePolicy = configureBrowserPolicy(browserPolicy.current() ?? null);
      });
      return () => {
        unsubscribe();
        disposePolicy();
      };
    });
    const observedFileIcons = context.observe<WorkspaceFileIconsCapability>(
      WORKSPACE_FILE_ICONS_SERVICE,
    );
    await context.effect(() =>
      configureFileIcons({
        fileIconUrl: (name) => observedFileIcons.current()?.fileIconUrl(name) ?? "",
        folderIconUrl: (name, expanded) =>
          observedFileIcons.current()?.folderIconUrl(name, expanded) ?? "",
      }),
    );
    context.feature(
      {
        id: "agents-navigation",
        label: "Agent manager navigation",
        requires: [UI_AGENTS_VIEW_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          configureAgentsView(
            scope.get<UiAgentsViewCapability>(UI_AGENTS_VIEW_SERVICE),
          ),
        ),
    );
    context.feature(
      {
        id: "editor-navigation",
        label: "Editor navigation from Chat",
        requires: [EDITOR_NAVIGATION_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          configureEditorNavigation(
            scope.get<EditorNavigationCapability>(EDITOR_NAVIGATION_SERVICE),
          ),
        ),
    );
    context.feature(
      {
        id: "workspace-files",
        label: "Workspace file context",
        requires: [WORKSPACE_FILES_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) =>
        scope.effect(() =>
          configureNativeFiles(
            scope.get<WorkspaceFilesCapability>(WORKSPACE_FILES_SERVICE),
            workspaceRigs,
          ),
        ),
    );
    if (!useChatStore.getState().selectedModelId) {
      useChatStore.getState().setSelectedModelId(selectedDefaultModelId());
    }
    await useChatStore.getState().hydrateSessions();
    context.feature(
      {
        id: "inference-execution",
        label: "AI request execution",
        requires: [AI_INFERENCE_SERVICE],
        uiPolicy: "retain-disabled",
      },
      async (scope) => {
        const inference = scope.get<AiInferenceCapability>(AI_INFERENCE_SERVICE);
        await scope.effect(() => configureCompactionRuntime(inference));
        await scope.effect(() => {
          let disposeTools = () => {};
          let disposeChat = () => {};
          const refresh = () => {
            disposeChat();
            disposeTools();
            const contributions = tools.snapshot();
            disposeTools = configureToolContributions(contributions);
            disposeChat = configureChatRuntime({
              inference,
              tools: contributions,
              toolExecution,
              workspaceRigs,
            });
          };
          refresh();
          const unsubscribe = tools.subscribe(refresh);
          return () => {
            unsubscribe();
            disposeChat();
            disposeTools();
          };
        });
        await scope.effect(() =>
          bootstrapSessions({ preferences, inference, events, models }),
        );
      },
    );
    context.feature(
      {
        id: "speech",
        label: "Speech transcription",
        requires: [AI_SPEECH_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          configureSpeechCapability(
            scope.get<AiSpeechCapability>(AI_SPEECH_SERVICE),
          ),
        ),
    );
    context.feature(
      {
        id: "platform-runtime",
        label: "AI persistence runtime",
        requires: [STORAGE_APPLICATION_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) =>
        scope.effect(() =>
          configurePlatformRuntime({
            storage: scope.get<StorageCapability>(STORAGE_APPLICATION_SERVICE),
            events,
          }),
        ),
    );
    context.feature(
      {
        id: "agent-notifications",
        label: "Local agent notifications",
        requires: [AGENTS_ACTIVITY_CONTROL_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          configureLocalAgentNotifications(
            scope.get<AgentActivityControlCapability>(
              AGENTS_ACTIVITY_CONTROL_SERVICE,
            ),
          ),
        ),
    );
    const trajectoryNavigation =
      context.observe<TrajectoryNavigationCapability>(
        TRAJECTORY_NAVIGATION_SERVICE,
      );
    context.feature(
      {
        id: "dock-integration",
        label: "AI dock and trajectory integration",
        requires: [
          WORKSPACE_TABS_SERVICE,
          UI_AI_DOCK_VIEWS_SERVICE,
          UI_TABS_KINDS_SERVICE,
        ],
        uiPolicy: "remove",
      },
      async (scope) => {
        const tabs = scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE);
        const tabKinds = scope.get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE);
        const dockViews = scope.get<UiAiDockViewRegistry>(UI_AI_DOCK_VIEWS_SERVICE);
        const trajectory = () =>
          tabKinds.snapshot().some((entry) => entry.kinds.includes("trajectory"))
            ? trajectoryNavigation.current() ?? null
            : null;
        await scope.effect(() => {
          let disposeDock = configureDockIntegrations({
            rigs: workspaceRigs,
            tabs,
            views: dockViews.snapshot(),
            trajectory: trajectory(),
          });
          const refresh = () => {
            disposeDock();
            disposeDock = configureDockIntegrations({
              rigs: workspaceRigs,
              tabs,
              views: dockViews.snapshot(),
              trajectory: trajectory(),
            });
          };
          const unsubscribeDockViews = dockViews.subscribe(refresh);
          const unsubscribeTabKinds = tabKinds.subscribe(refresh);
          const unsubscribeTrajectory = trajectoryNavigation.subscribe(refresh);
          return () => {
            unsubscribeTrajectory();
            unsubscribeTabKinds();
            unsubscribeDockViews();
            disposeDock();
          };
        });
      },
    );
    await context.effect(() =>
      (
        context.get<AiSessionsCapability>(AI_SESSIONS_SERVICE) as
          AiSessionsCapability & AiSessionsHostControl
      ).bind(aiSessionsCapability),
    );
    await context.effect(() =>
      (
        context.get<UiWorkspaceComposerCapability>(
          UI_WORKSPACE_COMPOSER_SERVICE,
        ) as UiWorkspaceComposerCapability & UiWorkspaceComposerHostControl
      ).bind(workspaceComposerCapability),
    );
    context.feature(
      {
        id: "composer-footer-placement",
        label: "Workspace AI composer footer",
        requires: [WORKSPACE_TABS_SERVICE, UI_WORKSPACE_FOOTER_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          scope
            .get<UiWorkspaceFooterRegistry>(UI_WORKSPACE_FOOTER_SERVICE)
            .register(
              createAiConnectFooterContribution(
                scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
              ),
              { pluginId: "ai-chat-native", generation: context.generation, key: "ai-connect" },
            ),
        ),
    );
    context.feature(
      {
        id: "background-placement",
        label: "AI session background task",
        requires: [WORKSPACE_TABS_SERVICE, UI_BACKGROUND_TASKS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          scope
            .get<UiBackgroundRegistry>(UI_BACKGROUND_TASKS_SERVICE)
            .register(
              createAiBackgroundContribution(
                workspaceRigs,
                scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
              ),
              { pluginId: "ai-chat-native", generation: context.generation, key: "ai-session-binding" },
            ),
        ),
    );
    context.feature(
      {
        id: "dock-surface-placement",
        label: "AI dock surface",
        requires: [UI_DOCK_SURFACES_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          scope
            .get<UiDockSurfaceRegistry>(UI_DOCK_SURFACES_SERVICE)
            .register(aiDockContribution, {
              pluginId: "ai-chat-native",
              generation: context.generation,
              key: aiDockContribution.id,
            }),
        ),
    );
    context.feature(
      {
        id: "overlay-placement",
        label: "AI overlays",
        requires: [WORKSPACE_TABS_SERVICE, UI_OVERLAYS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          scope
            .get<UiOverlayRegistry>(UI_OVERLAYS_SERVICE)
            .register(
              createAiOverlayContribution(
                scope.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
              ),
              { pluginId: "ai-chat-native", generation: context.generation, key: "ai-chat-overlays" },
            ),
        ),
    );
  },
};

export default plugin;
