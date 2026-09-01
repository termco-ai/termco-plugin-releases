import {
  AI_INFERENCE_SERVICE,
  type AiInferenceCapability,
} from "@termco/ai-inference-base";
import {
  AI_MODELS_SERVICE,
  type AiModelRegistry,
} from "@termco/ai-models-base";
import {
  AI_SESSIONS_SERVICE,
  type AiSessionsCapability,
} from "@termco/ai-sessions-base";
import { DESKTOP_INTEGRATION_SERVICE, type DesktopIntegrationCapability } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { WORKSPACE_FILE_ICONS_SERVICE, type WorkspaceFileIconsCapability } from "@termco/files-base";
import { GIT_REPOSITORY_SERVICE, type GitCapability } from "@termco/git-base";
import {
  createLiveOptionalFacade,
  type Dispose,
  type PluginModule,
} from "@termco/kernel";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandContribution,
  type UiCommandRegistry,
} from "@termco/ui-commands-base";
import type {
  UiSidebarBadgeProps,
  UiSidebarViewContribution,
  UiSidebarViewProps,
  UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import { UI_SIDEBAR_VIEWS_SERVICE } from "@termco/ui-sidebar-base";
import { WORKSPACE_TABS_SERVICE, type WorkspaceTabsCapability } from "@termco/workspace-base";
import { SourceControlPanel } from "./baseline/SourceControlPanel";
import { useSourceControl } from "./baseline/useSourceControl";
import { useSourceControlContextPath } from "./context";
import { SourceControlIcon } from "./icon";
import {
  createSourceControlNavigation,
  installTerminalDiffNavigation,
  openWorkingDiffTab,
} from "./navigation";
import {
  installSourceControlRuntime,
  setSourceControlContext,
  sourceControlContext,
} from "./runtime";

function createBadge() {
  return function useSourceControlBadge({
    rootPath,
    workspace,
  }: UiSidebarBadgeProps): number {
    setSourceControlContext(rootPath, workspace);
    const summary = useSourceControl(rootPath, workspace, true);
    return summary.changedCount;
  };
}

function createPanel(
  tabs: WorkspaceTabsCapability,
  navigation: ReturnType<typeof createSourceControlNavigation>,
) {
  return function SourceControlSidebar(props: UiSidebarViewProps) {
    setSourceControlContext(props.rootPath, props.workspace);
    const contextPath = useSourceControlContextPath(tabs, props.rootPath);
    const summary = useSourceControl(contextPath, props.workspace, true);
    return (
      <SourceControlPanel
        open
        sourceControl={summary}
        onOpenDiff={(request) => openWorkingDiffTab(tabs, request)}
        onOpenGitGraph={() => void navigation.openGraph()}
        onOpenFile={(path) => props.openFile(path, true)}
        onNavigateToPath={props.navigateToPath}
      />
    );
  };
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_TABS_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
    UI_COMMANDS_SERVICE,
  ],
  optionalInject: [
    GIT_REPOSITORY_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    AI_MODELS_SERVICE,
    AI_INFERENCE_SERVICE,
    AI_SESSIONS_SERVICE,
    WORKSPACE_FILE_ICONS_SERVICE,
  ],
  async activate(context) {
    const facades: Array<{ dispose: Dispose }> = [];
    const live = <T extends object>(service: string, fallback: T): T => {
      const facade = createLiveOptionalFacade(context.observe<T>(service), fallback);
      facades.push(facade);
      return facade.value;
    };
    const desktop = live<DesktopIntegrationCapability>(
      DESKTOP_INTEGRATION_SERVICE,
      {
        openUrl: async () => {},
        openPath: async () => {},
        revealItem: () => {},
        relaunch: () => {},
        exit: () => {},
        setAutostart: () => {},
        autostartEnabled: () => false,
        readClipboardText: () => "",
        writeClipboardText: () => {},
        notify: () => {},
        log: () => {},
        subscribeDragDrop: () => () => {},
      },
    );
    const fileIcons = live<WorkspaceFileIconsCapability>(
      WORKSPACE_FILE_ICONS_SERVICE,
      {
        fileIconUrl: () => "",
        folderIconUrl: () => "",
      },
    );
    const tabs = context.get<WorkspaceTabsCapability>("workspace.tabs");
    const events = context.get<ApplicationEventsCapability>(
      EVENTS_APPLICATION_SERVICE,
    );
    const inference = context.observe<AiInferenceCapability>(AI_INFERENCE_SERVICE);
    const sessions = context.observe<AiSessionsCapability>(AI_SESSIONS_SERVICE);
    const models = live<AiModelRegistry>(AI_MODELS_SERVICE, {
      register: () => () => {},
      snapshot: () => [],
      subscribe: () => () => {},
    });
    await context.effect(() => async () => {
      for (const facade of facades.reverse()) await facade.dispose();
    });

    context.feature(
      {
        id: "git-source-control",
        label: "Git source control",
        requires: [GIT_REPOSITORY_SERVICE],
        uiPolicy: "remove",
      },
      async (scope) => {
        const git = scope.get<GitCapability>(GIT_REPOSITORY_SERVICE);
        await scope.effect(() => installTerminalDiffNavigation(events, tabs));
        await scope.effect(async () => {
          let active = true;
          let revision = 0;
          let disposeRuntime = () => {};
          const refresh = async () => {
            const refreshRevision = ++revision;
            const currentInference = inference.current() ?? null;
            const configuredProviderIds = currentInference
              ? (await currentInference.configuration()).configuredProviderIds
              : [];
            if (!active || refreshRevision !== revision) return;
            disposeRuntime();
            disposeRuntime = installSourceControlRuntime({
              git,
              desktop,
              fileIcons,
              tabs,
              inference: currentInference,
              sessions: sessions.current() ?? null,
              models,
              configuredProviderIds,
            });
          };
          await refresh();
          const unsubscribeInference = inference.subscribe(() => void refresh());
          const unsubscribeSessions = sessions.subscribe(() => void refresh());
          return () => {
            active = false;
            revision += 1;
            unsubscribeSessions();
            unsubscribeInference();
            disposeRuntime();
          };
        });
        const navigation = createSourceControlNavigation(
          git,
          tabs,
          sourceControlContext,
        );
        scope.provide("source-control.navigation", navigation);
        const contribution: UiSidebarViewContribution = {
          id: "source-control",
          label: "Source Control",
          description:
            "Inspect, stage, commit, synchronize, and browse Git changes.",
          order: 20,
          icon: SourceControlIcon,
          useBadge: createBadge(),
          Component: createPanel(tabs, navigation),
        };
        await scope.effect(() =>
          scope
            .get<UiSidebarViewRegistry>(UI_SIDEBAR_VIEWS_SERVICE)
            .register(contribution, {
              pluginId: "source-control-sidebar",
              generation: context.generation,
              key: "source-control",
            }),
        );
        const commands: UiCommandContribution[] = [
          {
            id: "git.source",
            title: "Toggle source control",
            description: "Open the profile-selected Source Control sidebar.",
            group: "Git",
            keywords: ["git", "changes", "staging", "diff"],
            shortcutId: "pane.source",
            order: 40,
            icon: SourceControlIcon,
            run: (runtime) => runtime.showSidebarView("source-control"),
          },
          {
            id: "git.graph",
            title: "Open git graph",
            description: "Open commit history for the active repository.",
            group: "Git",
            keywords: ["git", "graph", "history", "log", "commits"],
            order: 41,
            icon: SourceControlIcon,
            run: () => navigation.openGraph(),
          },
        ];
        for (const command of commands) {
          await scope.effect(() =>
            scope.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(command, {
              pluginId: "source-control-sidebar",
              generation: context.generation,
              key: command.id,
            }),
          );
        }
      },
    );
  },
};

export default plugin;
