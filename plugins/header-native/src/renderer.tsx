import type {
  AgentActivityCapability,
  AgentHooksCapability,
} from "@termco/agents-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { BrowserTabsCapability } from "@termco/browser-base";
import type { DesktopWindowCapability } from "@termco/desktop-base";
import type {
  EditorLanguagesCapability,
  EditorNavigationCapability,
  EditorSessionsCapability,
} from "@termco/editor-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type { SourceControlNavigationCapability } from "@termco/git-base";
import {
  createLiveOptionalFacade,
  type Dispose,
  type PluginModule,
} from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { SshClientCapability } from "@termco/ssh-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";
import type {
  UiHeaderItemContribution,
  UiHeaderItemRegistry,
  UiHeaderSearchCapability,
} from "@termco/ui-header-base";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import type { UiTabPresentationCapability } from "@termco/ui-tabs-base";
import type {
  WorkspacePresentationCapability,
  WorkspaceRigOverviewCapability,
  WorkspaceRigsCapability,
  WorkspaceRigWorkflowsCapability,
  WorkspaceTabActionsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import ui from "@termco/ui";

const NO_SUBSCRIBE = () => () => {};
const EMPTY_SHORTCUTS_SNAPSHOT = {
  revision: 0,
  groups: [],
  shortcuts: [],
  overrides: {},
} as const;

const EMPTY_SHORTCUTS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => EMPTY_SHORTCUTS_SNAPSHOT,
  bindings: () => [],
  match: () => false,
  format: () => [],
  useHandlers(handlers, options) {
    const latest = ui.React.useRef({ handlers, options });
    latest.current = { handlers, options };
    ui.React.useLayoutEffect(() => {}, [null]);
  },
  setBindings: async () => {},
  reset: async () => {},
  resetAll: async () => {},
} as ShortcutRegistryCapability;
const EMPTY_ACTIVITY = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
    revision: 0,
    sessions: [],
    localAgent: null,
    notifications: [],
  }),
  activateLocalAgent: () => {},
  markAllRead: () => {},
  clearNotifications: () => {},
} as unknown as AgentActivityCapability;
const EMPTY_DESKTOP_WINDOW = {
  minimize: async () => {},
  toggleMaximize: async () => {},
  close: async () => {},
  isMaximized: async () => false,
  onResized: NO_SUBSCRIBE,
} as unknown as DesktopWindowCapability;
const EMPTY_AI_SESSIONS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
    revision: 0,
    panelOpen: false,
    miniOpen: false,
    selectedModelId: "",
    activeSessionId: null,
    agent: { status: "idle", step: null, error: null },
  }),
  openPanel: () => {},
  focusInput: () => {},
  togglePanel: () => {},
} as unknown as AiSessionsCapability;
const EMPTY_AGENTS_VIEW = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({ revision: 0, open: false, openSequence: 0 }),
  show: () => {},
  close: () => {},
} as unknown as UiAgentsViewCapability;
const EMPTY_BROWSER_TABS = {
  open: () => 0,
} as unknown as BrowserTabsCapability;
const EMPTY_PALETTE = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
    revision: 0,
    open: false,
    mode: "commands",
    query: "",
    anchor: null,
    inputSlot: null,
  }),
  show: () => {},
  close: () => {},
  setAnchor: () => {},
  setInputSlot: () => {},
} as unknown as UiCommandPaletteCapability;
const EMPTY_EDITOR_NAVIGATION = {
  openNewFile: () => {},
  pin: () => false,
  setLanguage: () => false,
} as unknown as EditorNavigationCapability;
const EMPTY_EDITOR_SESSIONS = {
  save: async () => false,
} as unknown as EditorSessionsCapability;
const EMPTY_PRESENTATION = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
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
const EMPTY_RIG_WORKFLOWS = {
  createLocal: () => "",
  createSsh: async () => null,
  remove: () => {},
} as WorkspaceRigWorkflowsCapability;
const EMPTY_RIGS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({ hydrated: true, rigs: [], activeId: null }),
  activate: () => {},
  rename: () => {},
  reorder: () => {},
} as unknown as WorkspaceRigsCapability;
const EMPTY_SETTINGS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
    revision: 0,
    open: false,
    requestedSection: null,
    openSequence: 0,
  }),
  show: () => {},
  close: () => {},
} as unknown as UiSettingsViewCapability;
const EMPTY_SIDEBAR = { toggle: () => {} } as UiSidebarNavigationCapability;
const EMPTY_TAB_ACTIONS = {
  close: async () => {},
  closeMany: async () => {},
  newRightOf: () => null,
  duplicate: () => null,
  rename: () => {},
} as unknown as WorkspaceTabActionsCapability;
const EMPTY_TABS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: () => ({
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
  transition: () => {},
  reorderByGap: () => false,
  moveToRig: () => ({ changed: false, followTargetRig: false }),
  reorderAcrossRigs: () => ({ changed: false, followTargetRig: false }),
} as unknown as WorkspaceTabsCapability;
const EMPTY_TERMINALS = {
  open: () => ({ tabId: 0, leafId: 0 }),
  focus: () => false,
} as unknown as TerminalSessionsCapability;
const EMPTY_AGENT_HOOKS: AgentHooksCapability = {
  enable: () => {},
  status: () => false,
};
const EMPTY_FILE_ICONS: WorkspaceFileIconsCapability = {
  fileIconUrl: () => "",
  folderIconUrl: () => "",
};
const EMPTY_LANGUAGES: EditorLanguagesCapability = {
  all: () => [],
  common: () => [],
  displayName: (filename) => filename ?? "Plain Text",
};
const EMPTY_SSH = {
  listHosts: () => [],
} as unknown as SshClientCapability;
const EMPTY_SOURCE_CONTROL: SourceControlNavigationCapability = {
  openGraph: async () => {},
};
import { AgentAwareHeader } from "./AgentAwareHeader";
import { installWindowResizeSubscriber } from "./baseline/header/components/WindowControls";
import { TabIcon } from "./baseline/tabs/components/TabIcon";
import { installHeaderDependencies } from "./baseline/runtime";
import { RigOverviewStore } from "./rigOverview";
import { createRigsOnboardingContribution } from "./onboarding";
import { HeaderSearchFocus } from "./searchFocus";
import { useHeaderRuntime } from "./runtime";
import {
  AGENTS_ACTIVITY_SERVICE,
  AGENTS_TERMINAL_HOOKS_SERVICE,
} from "@termco/agents-base";
import { AI_SESSIONS_SERVICE } from "@termco/ai-sessions-base";
import { BROWSER_TABS_SERVICE } from "@termco/browser-base";
import { DESKTOP_WINDOW_SERVICE } from "@termco/desktop-base";
import {
  EDITOR_LANGUAGES_SERVICE,
  EDITOR_NAVIGATION_SERVICE,
  EDITOR_SESSIONS_SERVICE,
} from "@termco/editor-base";
import { WORKSPACE_FILE_ICONS_SERVICE } from "@termco/files-base";
import { SOURCE_CONTROL_NAVIGATION_SERVICE } from "@termco/git-base";
import { SHORTCUTS_REGISTRY_SERVICE } from "@termco/shortcuts-base";
import { SSH_CLIENT_SERVICE } from "@termco/ssh-base";
import { TERMINAL_SESSIONS_SERVICE } from "@termco/terminal-base";
import { UI_AGENTS_VIEW_SERVICE } from "@termco/ui-agents-base";
import { UI_HEADER_ITEMS_SERVICE } from "@termco/ui-header-base";
import { UI_COMMAND_PALETTE_SERVICE } from "@termco/ui-overlays-base";
import { UI_SETTINGS_VIEW_SERVICE } from "@termco/ui-settings-base";
import { UI_SIDEBAR_NAVIGATION_SERVICE } from "@termco/ui-sidebar-base";
import {
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_RIG_WORKFLOWS_SERVICE,
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_TAB_ACTIONS_SERVICE,
  WORKSPACE_TABS_SERVICE,
} from "@termco/workspace-base";

const plugin: PluginModule = {
  inject: [
    UI_HEADER_ITEMS_SERVICE,
  ],
  optionalInject: [
    SHORTCUTS_REGISTRY_SERVICE,
    AGENTS_ACTIVITY_SERVICE,
    DESKTOP_WINDOW_SERVICE,
    AI_SESSIONS_SERVICE,
    UI_AGENTS_VIEW_SERVICE,
    BROWSER_TABS_SERVICE,
    UI_COMMAND_PALETTE_SERVICE,
    EDITOR_NAVIGATION_SERVICE,
    EDITOR_SESSIONS_SERVICE,
    WORKSPACE_PRESENTATION_SERVICE,
    WORKSPACE_RIG_WORKFLOWS_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    UI_SETTINGS_VIEW_SERVICE,
    UI_SIDEBAR_NAVIGATION_SERVICE,
    WORKSPACE_TAB_ACTIONS_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
    AGENTS_TERMINAL_HOOKS_SERVICE,
    EDITOR_LANGUAGES_SERVICE,
    SSH_CLIENT_SERVICE,
    SOURCE_CONTROL_NAVIGATION_SERVICE,
    WORKSPACE_FILE_ICONS_SERVICE,
    ONBOARDING_REGISTRY_SERVICE,
    ONBOARDING_RUNTIME_SERVICE,
  ],
  async activate(context) {
    const facades: Array<{ dispose: Dispose }> = [];
    const live = <T extends object>(service: string, fallback: T): T => {
      const facade = createLiveOptionalFacade(
        context.observe<T>(service),
        fallback,
      );
      facades.push(facade);
      return facade.value;
    };
    const fileIcons = live(WORKSPACE_FILE_ICONS_SERVICE, EMPTY_FILE_ICONS);
    const rigOverview = new RigOverviewStore();
    contributeOnboarding(
      context,
      createRigsOnboardingContribution(rigOverview),
      "Local and remote rig guidance",
    );
    context.feature(
      {
        id: "onboarding:rigs-context",
        label: "Contextual rig guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        let open = rigOverview.snapshot().open;
        return rigOverview.subscribe(() => {
          const next = rigOverview.snapshot().open;
          if (next && !open) {
            void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
              .suggest("header-native.local-and-remote-rigs");
          }
          open = next;
        });
      },
    );
    const headerSearch = new HeaderSearchFocus();
    const shortcuts = live(SHORTCUTS_REGISTRY_SERVICE, EMPTY_SHORTCUTS);
    const activity = live(AGENTS_ACTIVITY_SERVICE, EMPTY_ACTIVITY);
    const desktopWindow = live(DESKTOP_WINDOW_SERVICE, EMPTY_DESKTOP_WINDOW);
    await context.effect(() => async () => {
      for (const facade of facades.reverse()) await facade.dispose();
    });
    context.feature(
      {
        id: "window-resize",
        label: "Native window resize integration",
        requires: [DESKTOP_WINDOW_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) =>
        installWindowResizeSubscriber((listener) =>
          scope.get<DesktopWindowCapability>(DESKTOP_WINDOW_SERVICE).onResized(listener),
        ),
    );
    context.provide<WorkspaceRigOverviewCapability>(
      "workspace.rigs-overview",
      rigOverview,
    );
    const runtimeCapabilities = {
      aiSessions: live(AI_SESSIONS_SERVICE, EMPTY_AI_SESSIONS),
      agentsView: live(UI_AGENTS_VIEW_SERVICE, EMPTY_AGENTS_VIEW),
      browserTabs: live(BROWSER_TABS_SERVICE, EMPTY_BROWSER_TABS),
      commandPalette: live(UI_COMMAND_PALETTE_SERVICE, EMPTY_PALETTE),
      desktopWindow,
      editorNavigation: live(EDITOR_NAVIGATION_SERVICE, EMPTY_EDITOR_NAVIGATION),
      editorSessions: live(EDITOR_SESSIONS_SERVICE, EMPTY_EDITOR_SESSIONS),
      presentation: live(WORKSPACE_PRESENTATION_SERVICE, EMPTY_PRESENTATION),
      rigWorkflows: live(WORKSPACE_RIG_WORKFLOWS_SERVICE, EMPTY_RIG_WORKFLOWS),
      rigs: live(WORKSPACE_RIGS_SERVICE, EMPTY_RIGS),
      settingsView: live(UI_SETTINGS_VIEW_SERVICE, EMPTY_SETTINGS),
      sidebarNavigation: live(UI_SIDEBAR_NAVIGATION_SERVICE, EMPTY_SIDEBAR),
      tabActions: live(WORKSPACE_TAB_ACTIONS_SERVICE, EMPTY_TAB_ACTIONS),
      tabs: live(WORKSPACE_TABS_SERVICE, EMPTY_TABS),
      terminalSessions: live(TERMINAL_SESSIONS_SERVICE, EMPTY_TERMINALS),
    };
    await context.effect(() =>
      installHeaderDependencies({
        agentHooks: live(AGENTS_TERMINAL_HOOKS_SERVICE, EMPTY_AGENT_HOOKS),
        fileIcons,
        languages: live(EDITOR_LANGUAGES_SERVICE, EMPTY_LANGUAGES),
        shortcuts,
        ssh: live(SSH_CLIENT_SERVICE, EMPTY_SSH),
      }),
    );
    context.provide<UiTabPresentationCapability>("ui.tabs.presentation", {
      Icon: TabIcon,
    });
    context.provide<UiHeaderSearchCapability>("ui.header-search", headerSearch);
    const sourceControlNavigation = live(
      SOURCE_CONTROL_NAVIGATION_SERVICE,
      EMPTY_SOURCE_CONTROL,
    );
    const header: UiHeaderItemContribution = {
      id: "default-header",
      label: "Default application header",
      description:
        "The exact title bar, workspace strip, command field, activity controls, and tab strip.",
      region: "root",
      order: 0,
      Component() {
        const runtime = useHeaderRuntime(runtimeCapabilities);
        if (runtime.zenMode) return null;
        return (
          <AgentAwareHeader
            activity={activity}
            rigOverview={rigOverview}
            headerSearch={headerSearch}
            shortcuts={shortcuts}
            runtime={{
              ...runtime,
              newGitGraph: () => void sourceControlNavigation.openGraph(),
              minimizeWindow: () => void desktopWindow.minimize(),
              toggleMaximizeWindow: () =>
                void desktopWindow.toggleMaximize(),
              closeWindow: () => void desktopWindow.close(),
              isWindowMaximized: () => desktopWindow.isMaximized(),
            }}
          />
        );
      },
    };
    await context.effect(() =>
      context.get<UiHeaderItemRegistry>("ui.header.items").register(header, {
        pluginId: "header-native",
        generation: context.generation,
        key: header.id,
      }),
    );
  },
};

export default plugin;
