import { AI_SESSIONS_SERVICE, type AiSessionsCapability } from "@termco/ai-sessions-base";
import { EDITOR_LSP_STATUS_SERVICE, type EditorLspStatusCapability } from "@termco/editor-base";
import { WORKSPACE_FILES_SERVICE, type WorkspaceFilesCapability } from "@termco/files-base";
import type { OptionalCapability, PluginModule } from "@termco/kernel";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import { UI_SETTINGS_VIEW_SERVICE, type UiSettingsViewCapability } from "@termco/ui-settings-base";
import {
  UI_STATUSBAR_ITEMS_SERVICE,
  type UiStatusbarItemContribution,
  type UiStatusbarItemRegistry,
  type UiStatusbarRootSlots,
} from "@termco/ui-statusbar-base";
import {
  WORKSPACE_ENVIRONMENT_SERVICE,
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspaceEnvironmentCapability,
  type WorkspacePresentationCapability,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { useSyncExternalStore } from "react";
import { ExactStatusBar } from "./ExactStatusBar";
import { useStatusbarRuntime } from "./runtime";

const plugin: PluginModule = {
  inject: [
    UI_STATUSBAR_ITEMS_SERVICE,
  ],
  optionalInject: [
    WORKSPACE_FILES_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    EDITOR_LSP_STATUS_SERVICE,
    AI_SESSIONS_SERVICE,
    WORKSPACE_ENVIRONMENT_SERVICE,
    WORKSPACE_PRESENTATION_SERVICE,
    UI_SETTINGS_VIEW_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
  ],
  async activate(context) {
    const files = context.observe<WorkspaceFilesCapability>(WORKSPACE_FILES_SERVICE);
    const preferences = context.observe<PreferencesCapability>(
      SETTINGS_PREFERENCES_SERVICE,
    );
    const lspStatus = context.observe<EditorLspStatusCapability>(
      EDITOR_LSP_STATUS_SERVICE,
    );
    const aiSessions = context.observe<AiSessionsCapability>(AI_SESSIONS_SERVICE);
    const environment = context.observe<WorkspaceEnvironmentCapability>(
      WORKSPACE_ENVIRONMENT_SERVICE,
    );
    const presentation = context.observe<WorkspacePresentationCapability>(
      WORKSPACE_PRESENTATION_SERVICE,
    );
    const settingsView = context.observe<UiSettingsViewCapability>(
      UI_SETTINGS_VIEW_SERVICE,
    );
    const tabs = context.observe<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE);
    const terminalSessions = context.observe<TerminalSessionsCapability>(
      TERMINAL_SESSIONS_SERVICE,
    );
    const CompleteStatusbar = ({
      leftItems,
      rightItems,
    }: UiStatusbarRootSlots) => {
      const runtimeCapabilities = {
        aiSessions: useOptional(aiSessions, EMPTY_AI_SESSIONS),
        environment: useOptional(environment, EMPTY_ENVIRONMENT),
        presentation: useOptional(presentation, EMPTY_PRESENTATION),
        settingsView: useOptional(settingsView, EMPTY_SETTINGS_VIEW),
        tabs: useOptional(tabs, EMPTY_TABS),
        terminalSessions: useOptional(terminalSessions, EMPTY_TERMINALS),
      };
      const activeFiles = useOptional(files, EMPTY_FILES);
      const activePreferences = useOptional(preferences, EMPTY_PREFERENCES);
      const activeLspStatus = useOptional(lspStatus, EMPTY_LSP_STATUS);
      const runtime = useStatusbarRuntime(runtimeCapabilities);
      const lspServerId = useSyncExternalStore(
        activeLspStatus.subscribe,
        () => activeLspStatus.serverId(runtime.workspace, runtime.filePath),
        () => null,
      );
      if (runtime.zenMode) return null;
      return (
        <ExactStatusBar
          runtime={{ ...runtime, lspServerId }}
          files={activeFiles}
          preferences={activePreferences}
          leftItems={leftItems}
          rightItems={rightItems}
        />
      );
    };
    const contribution: UiStatusbarItemContribution = {
      id: "default-statusbar",
      label: "Default status bar",
      description:
        "Complete default footer with workspace, path, LSP, privacy, and AI state.",
      side: "root",
      order: 0,
      Component: CompleteStatusbar,
    };
    await context.effect(() =>
      context
        .get<UiStatusbarItemRegistry>(UI_STATUSBAR_ITEMS_SERVICE)
        .register(contribution, {
          pluginId: "statusbar-native",
          generation: context.generation,
          key: contribution.id,
        }),
    );
  },
};

const NO_SUBSCRIBE = () => () => {};
const stableSnapshot = <T,>(snapshot: T) => () => snapshot;
const EMPTY_AI_SESSIONS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    revision: 0,
    panelOpen: false,
    miniOpen: false,
    selectedModelId: "",
    activeSessionId: null,
    agent: { status: "idle", step: null, error: null },
  }),
  openPanel: () => {},
} as unknown as AiSessionsCapability;
const EMPTY_ENVIRONMENT = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    workspace: { kind: "local" },
    home: null,
    launchCwd: null,
    launchCwdResolved: false,
    wslDistros: [],
    wslLoading: false,
    wslError: null,
  }),
  switch: async () => false,
  refreshWslDistros: async () => [],
} as unknown as WorkspaceEnvironmentCapability;
const EMPTY_PRESENTATION = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    revision: 0,
    header: {
      tabs: [],
      allTabs: [],
      activeTabId: 0,
      agentsViewOpen: false,
      editorDirty: false,
      findTarget: null,
    },
    sidebar: {
      rootPath: null,
      workspace: { kind: "local" },
      activeFilePath: null,
    },
    context: {
      cwd: null,
      filePath: null,
      home: null,
      privateActive: false,
      zenMode: false,
    },
  }),
} as WorkspacePresentationCapability;
const EMPTY_SETTINGS_VIEW = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    revision: 0,
    open: false,
    requestedSection: null,
    openSequence: 0,
  }),
  show: () => {},
} as unknown as UiSettingsViewCapability;
const EMPTY_TABS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    revision: 0,
    initialized: false,
    tabs: [],
    activeId: 0,
    splitTabId: 0,
    focusedPane: "left",
    booted: false,
    activeRigIdForNewTabs: "default",
    activeTabByRig: {},
  }),
} as unknown as WorkspaceTabsCapability;
const EMPTY_TERMINALS = {
  write: () => false,
  focus: () => false,
} as unknown as TerminalSessionsCapability;
const EMPTY_FILES = {
  listSubdirs: async () => [],
} as unknown as WorkspaceFilesCapability;
const EMPTY_PREFERENCES = {
  get: async () => undefined,
} as unknown as PreferencesCapability;
const EMPTY_LSP_STATUS: EditorLspStatusCapability = {
  subscribe: NO_SUBSCRIBE,
  serverId: () => null,
};

function useOptional<T>(capability: OptionalCapability<T>, fallback: T): T {
  return useSyncExternalStore(
    capability.subscribe,
    () => capability.current() ?? fallback,
    () => fallback,
  );
}

export default plugin;
