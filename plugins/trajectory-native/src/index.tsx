import {
  AGENTS_CODING_UI_SERVICE,
  type CodingAgentsUiCapability,
} from "@termco/agents-base";
import {
  AI_SESSIONS_SERVICE,
  type AiSessionsCapability,
} from "@termco/ai-sessions-base";
import type { PluginModule } from "@termco/kernel";
import {
  SESSION_HISTORY_SERVICE,
  SESSION_QUERY_SERVICE,
  type SessionHistoryCapability,
  type SessionQueryCapability,
} from "@termco/session-base";
import {
  TRAJECTORY_NAVIGATION_SERVICE,
  type TrajectoryNavigationCapability,
} from "@termco/trajectory-base";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandRegistry,
  type UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import {
  UI_TABS_KINDS_SERVICE,
  type UiTabKindContribution,
  type UiTabKindRegistry,
} from "@termco/ui-tabs-base";
import {
  WORKSPACE_TABS_SERVICE,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import {
  configureTrajectoryRuntime,
  getTrajectoryRuntime,
  type TrajectoryRuntime,
} from "./runtime";
import { openTrajectoryTab, TrajectoryStack } from "./TrajectoryStack";
import { useTrajectoryUi } from "./uiStore";

const navigation: TrajectoryNavigationCapability = {
  openSession: (sessionId, location) =>
    openTrajectoryTab(
      getTrajectoryRuntime().tabs,
      sessionId,
      location?.eventSeq,
      location?.recordId,
    ),
  openSearch: () => useTrajectoryUi.getState().setSearchOpen(true),
  openSessionList: () => openTrajectoryTab(getTrajectoryRuntime().tabs, ""),
};

const plugin: PluginModule = {
  inject: [
    SESSION_HISTORY_SERVICE,
    UI_TABS_KINDS_SERVICE,
    UI_COMMANDS_SERVICE,
    WORKSPACE_TABS_SERVICE,
  ],
  optionalInject: [SESSION_QUERY_SERVICE, AI_SESSIONS_SERVICE, AGENTS_CODING_UI_SERVICE],
  async activate(context) {
    const runtime: TrajectoryRuntime = {
      history: context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
      tabs: context.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
      query: null,
      aiSessions: null,
      codingAgents: null,
    };
    await context.effect(() => {
      configureTrajectoryRuntime(runtime);
      return () => configureTrajectoryRuntime(null);
    });
    context.feature(
      { id: "query", label: "Semantic session search", requires: [SESSION_QUERY_SERVICE], uiPolicy: "remove" },
      (scope) => scope.effect(() => {
        runtime.query = scope.get<SessionQueryCapability>(SESSION_QUERY_SERVICE);
        return () => { runtime.query = null; };
      }),
    );
    context.feature(
      { id: "chat-actions", label: "Chat session actions", requires: [AI_SESSIONS_SERVICE], uiPolicy: "remove" },
      (scope) => scope.effect(() => {
        runtime.aiSessions = scope.get<AiSessionsCapability>(AI_SESSIONS_SERVICE);
        return () => { runtime.aiSessions = null; };
      }),
    );
    context.feature(
      { id: "coding-actions", label: "Coding-agent session actions", requires: [AGENTS_CODING_UI_SERVICE], uiPolicy: "remove" },
      (scope) => scope.effect(() => {
        runtime.codingAgents = scope.get<CodingAgentsUiCapability>(AGENTS_CODING_UI_SERVICE);
        return () => { runtime.codingAgents = null; };
      }),
    );

    const surface: UiTabKindContribution = {
      id: "trajectory",
      label: "Trajectory",
      description: "Inspect semantic records, raw events, lineage, and session health.",
      kinds: ["trajectory"],
      Component: TrajectoryStack,
    };
    const commands: UiCommandSourceContribution = {
      id: "trajectory",
      commands: () => [
        {
          id: "trajectory-open-current",
          title: "Open trajectory of current chat",
          description: "Inspect the canonical history of the active AI session.",
          group: "Trajectory",
          keywords: ["session", "timeline", "debug"],
          run: () => {
            const sessionId = runtime.aiSessions?.snapshot().activeSessionId;
            if (sessionId) navigation.openSession(sessionId as never);
          },
        },
        {
          id: "trajectory-search",
          title: "Search sessions…",
          description: "Search semantic records across current-format sessions.",
          group: "Trajectory",
          keywords: ["session", "find", "history"],
          run: navigation.openSearch,
        },
        {
          id: "trajectory-session-list",
          title: "Open sessions",
          description: "Browse and resume recorded Chat and coding-agent sessions.",
          group: "Trajectory",
          keywords: ["session", "history", "resume"],
          run: navigation.openSessionList,
        },
      ],
    };

    context.provide(TRAJECTORY_NAVIGATION_SERVICE, navigation);
    await context.effect(() => context.get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE).register(surface, { pluginId: "trajectory-native", generation: context.generation, key: surface.id }));
    await context.effect(() => context.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(commands, { pluginId: "trajectory-native", generation: context.generation, key: commands.id }));
  },
};

export default plugin;
