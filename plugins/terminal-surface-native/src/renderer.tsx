import {
  AI_LIVE_CONTRIBUTIONS_SERVICE,
  AI_LIVE_SERVICE,
  type AiLiveCapability,
  type AiLiveContributionCapability,
} from "@termco/ai-live-base";
import {
  DESKTOP_INTEGRATION_SERVICE,
  DESKTOP_WINDOW_SERVICE,
  type DesktopIntegrationCapability,
  type DesktopWindowCapability,
} from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE, type WorkspaceFilesCapability } from "@termco/files-base";
import { GIT_REPOSITORY_SERVICE, type GitCapability } from "@termco/git-base";
import { createLiveOptionalFacade, type PluginModule } from "@termco/kernel";
import { SHORTCUTS_REGISTRY_SERVICE, type ShortcutRegistryCapability } from "@termco/shortcuts-base";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import {
  TERMINAL_HISTORY_SERVICE,
  TERMINAL_PTY_SERVICE,
  type PtyCapability,
  type ShellHistoryCapability,
  type TerminalWorkspaceFooterCapability,
} from "@termco/terminal-base";
import {
  UI_COMMANDS_SERVICE,
  type UiCommandItem,
  type UiCommandRegistry,
  type UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import type {
  UiTabKindContribution,
  UiTabSearchHandle,
  UiTabSurfaceProps,
  UiTabsRuntime,
  UiTabKindRegistry,
} from "@termco/ui-tabs-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";
import { UI_THEME_SERVICE, type UiThemeCapability } from "@termco/ui-theme-base";
import {
  WORKSPACE_REGISTRY_SERVICE,
  WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspaceCapability,
  type WorkspaceTabCloseGuardContribution,
  type WorkspaceTabCloseGuardRegistry,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import {
  DashboardSquare01Icon,
  IncognitoIcon,
} from "@hugeicons/core-free-icons";

const EMPTY_SHORTCUTS_SNAPSHOT = {
  revision: 0,
  groups: [],
  shortcuts: [],
  overrides: {},
} as const;
const EMPTY_SHORTCUTS: ShortcutRegistryCapability = {
  snapshot: () => EMPTY_SHORTCUTS_SNAPSHOT,
  subscribe: () => () => {},
  bindings: () => [],
  match: () => false,
  format: () => [],
  useHandlers: () => {},
  setBindings: async () => {},
  reset: async () => {},
  resetAll: async () => {},
};

const EMPTY_THEME = {
  subscribe: () => () => {},
  snapshot: () => ({
    revision: 0,
    mode: "system" as const,
    resolvedMode: "dark" as const,
    themeId: "termco-default",
    themes: [],
    customThemeIds: [],
    editorTheme: "default",
    background: { kind: "none" as const, imageId: null, opacity: 0, blur: 0 },
  }),
  mutate: async () => ({}),
  validate: () => ({ ok: false as const, error: "Theme provider unavailable" }),
  resolveEditorTheme: (preference: string) => preference,
  Root: ({ children }: { children?: import("react").ReactNode }) => children,
} as UiThemeCapability;
import { useEffect, useMemo, useRef } from "react";
import {
  disposeSession,
  leafHasForegroundProcess,
  leafIds,
  TerminalStack,
  useTerminalFileDrop,
} from "./terminal";
import type { TerminalSearchHandle } from "./terminal/lib/search/types";
import { startAgentActivityListener } from "./terminal/lib/agentActivity";
import { removeLeaf, setLeafCwd } from "./terminal/lib/panes";
import type { TerminalTab } from "./tabTypes";
import { toTerminalTab } from "./terminalTab";
import {
  configureTerminalRuntime,
  notifyTerminalGitChanged,
  setActiveTabsRuntime,
  tabsRuntime,
  terminalRuntime,
} from "./runtime";
import { startTerminalPreferences } from "./preferences";
import {
  clearTerminalSessions,
  configureTerminalSessions,
  terminalSessions,
} from "./sessions";
import { installTerminalStyles } from "./styles";
import { updateFocusedTerminalLeaf } from "./focusOwnership";
import { createWorkspaceFooterContribution } from "./footer/WorkspaceFooter";
import { contributeTerminalAiLive } from "./aiLive";

const authorizedCwds = new WeakMap<UiTabsRuntime, Set<string>>();

export function updateLeafCwd(
  runtime: UiTabsRuntime,
  tabs: readonly TerminalTab[],
  leafId: number,
  cwd: string,
): void {
  const tab = tabs.find((candidate) =>
    leafIds(candidate.paneTree).includes(leafId),
  );
  if (!tab) return;
  runtime.updateTab(tab.id, {
    paneTree: setLeafCwd(tab.paneTree, leafId, cwd),
    cwd,
  });
  if (!cwd) return;
  const authorized = authorizedCwds.get(runtime) ?? new Set<string>();
  authorizedCwds.set(runtime, authorized);
  if (authorized.has(cwd)) return;
  authorized.add(cwd);
  try {
    terminalRuntime().workspace.authorize(cwd, runtime.workspace);
  } catch {
    authorized.delete(cwd);
  }
}

function closeLeaf(runtime: UiTabsRuntime, tabs: readonly TerminalTab[], leafId: number) {
  const tab = tabs.find((candidate) => leafIds(candidate.paneTree).includes(leafId));
  if (!tab) return;
  const nextTree = removeLeaf(tab.paneTree, leafId);
  if (!nextTree) {
    runtime.closeTab(tab.id);
    return;
  }
  const nextLeafIds = leafIds(nextTree);
  runtime.updateTab(tab.id, {
    paneTree: nextTree,
    activeLeafId: nextLeafIds.includes(tab.activeLeafId)
      ? tab.activeLeafId
      : nextLeafIds[0],
  });
}

export function handleTerminalLeafExit(
  runtime: UiTabsRuntime,
  tabs: readonly TerminalTab[],
  leafId: number,
  desktopWindow: Pick<DesktopWindowCapability, "close">,
): void {
  const tab = tabs.find((candidate) =>
    leafIds(candidate.paneTree).includes(leafId),
  );
  if (!tab) return;
  if (runtime.allTabs().length === 1 && leafIds(tab.paneTree).length === 1) {
    void desktopWindow.close();
    return;
  }
  closeLeaf(runtime, tabs, leafId);
}

function searchPort(
  handle: TerminalSearchHandle,
  focus: () => void,
): UiTabSearchHandle {
  return {
    setQuery(next) {
      if (next) handle.findNext(next, { incremental: true });
      else handle.clearDecorations();
    },
    clearQuery() {
      handle.clearDecorations();
    },
    findNext(query, options) {
      handle.findNext(query, {
        incremental: options?.incremental,
        decorations: {
          matchBackground: options?.matchBackground,
          activeMatchBackground: options?.activeMatchBackground,
          matchOverviewRuler: options?.matchOverviewRuler,
          activeMatchColorOverviewRuler:
            options?.activeMatchColorOverviewRuler,
        },
      });
    },
    findPrevious(query, options) {
      handle.findPrevious(query, {
        incremental: options?.incremental,
        decorations: {
          matchBackground: options?.matchBackground,
          activeMatchBackground: options?.activeMatchBackground,
          matchOverviewRuler: options?.matchOverviewRuler,
          activeMatchColorOverviewRuler:
            options?.activeMatchColorOverviewRuler,
        },
      });
    },
    focus,
  };
}

function TerminalSurface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
  useTerminalFileDrop();
  const terminalTabs = useMemo(
    () => tabs
      .map((tab) => toTerminalTab(tab, runtime))
      .filter((tab): tab is TerminalTab => tab !== null),
    [runtime, tabs],
  );
  const searchHandles = useRef(new Map<number, UiTabSearchHandle>());
  const previousLeaves = useRef(new Set<number>());
  setActiveTabsRuntime(runtime);

  useEffect(() => () => {
    if (tabsRuntime() === runtime) setActiveTabsRuntime(null);
  }, [runtime]);

  useEffect(() => {
    const current = new Set(terminalTabs.flatMap((tab) => leafIds(tab.paneTree)));
    for (const leafId of previousLeaves.current) {
      if (!current.has(leafId)) disposeSession(leafId);
    }
    previousLeaves.current = current;
  }, [terminalTabs]);

  useEffect(() => {
    const active = terminalTabs.find((tab) => tab.id === activeId);
    runtime.registerSearchHandle(
      active
        ? (() => {
            const handle = searchHandles.current.get(active.activeLeafId);
            return handle ?? null;
          })()
        : null,
    );
    return () => runtime.registerSearchHandle(null);
  }, [activeId, runtime, terminalTabs]);

  return (
    <TerminalStack
      tabs={terminalTabs}
      activeId={activeId}
      registerHandle={(leafId, handle) => terminalSessions.register(leafId, handle)}
      onSearchReady={(leafId, handle) => {
        searchHandles.current.set(
          leafId,
          searchPort(handle, () => terminalSessions.focus(leafId)),
        );
      }}
      onCwd={(leafId, cwd) => updateLeafCwd(runtime, terminalTabs, leafId, cwd)}
      onExit={(leafId) =>
        handleTerminalLeafExit(
          runtime,
          terminalTabs,
          leafId,
          terminalRuntime().desktopWindow,
        )
      }
      onFocusLeaf={(tabId, leafId) =>
        updateFocusedTerminalLeaf(runtime, tabId, leafId)
      }
    />
  );
}

async function terminalCloseVerdict(tab: {
  data?: Readonly<Record<string, unknown>>;
}) {
  const paneTree = tab.data?.paneTree as TerminalTab["paneTree"] | undefined;
  if (!paneTree) return "close" as const;
  const running = await Promise.all(
    leafIds(paneTree).map(leafHasForegroundProcess),
  );
  return running.some(Boolean)
    ? {
        prompt: {
          title: "Close Terminal?",
          body: "A process is running. Closing this tab will terminate it.",
          confirmLabel: "Close Anyway",
        },
      }
    : ("close" as const);
}

const closeGuard: WorkspaceTabCloseGuardContribution = {
  id: "terminal",
  kinds: ["terminal"],
  canClose: terminalCloseVerdict,
};

const terminalTabs: UiTabKindContribution = {
  id: "terminal",
  label: "Terminal",
  description: "Interactive terminal tabs with retained panes and command blocks.",
  kinds: ["terminal"],
  mountWhen: "always",
  Component: TerminalSurface,
  canClose: terminalCloseVerdict,
};

const commands: UiCommandItem[] = [
  {
    id: "tab.newBlock",
    title: "New block terminal",
    description: "Open a terminal that groups commands and output into blocks.",
    group: "Tabs",
    keywords: ["blocks", "warp", "command blocks", "terminal"],
    icon: DashboardSquare01Icon,
    run: () => { tabsRuntime()?.openTab("terminal", { blocks: true }); },
  },
  {
    id: "tab.newPrivate",
    title: "New private terminal",
    description: "Open a terminal whose contents are hidden from AI context.",
    group: "Tabs",
    keywords: ["privacy", "private", "incognito", "hidden from ai"],
    shortcutId: "tab.newPrivate",
    icon: IncognitoIcon,
    run: () => { tabsRuntime()?.openTab("terminal", { private: true }); },
  },
];

const commandSource: UiCommandSourceContribution = {
  id: "terminal",
  order: 10,
  commands: () => commands,
};

const plugin: PluginModule = {
  inject: [
    WORKSPACE_TABS_SERVICE,
    TERMINAL_PTY_SERVICE,
    TERMINAL_HISTORY_SERVICE,
    WORKSPACE_FILES_SERVICE,
    WORKSPACE_REGISTRY_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    DESKTOP_WINDOW_SERVICE,
    AI_LIVE_CONTRIBUTIONS_SERVICE,
    AI_LIVE_SERVICE,
    WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
    UI_TABS_KINDS_SERVICE,
    UI_COMMANDS_SERVICE,
  ],
  optionalInject: [
    GIT_REPOSITORY_SERVICE,
    UI_THEME_SERVICE,
    SHORTCUTS_REGISTRY_SERVICE,
  ],
  replacementImpact() {
    const resources = terminalSessions.leafIds().map((id) => ({ id: String(id), label: `Terminal pane ${id}` }));
    return resources.length === 0
      ? []
      : [{ capability: "terminal.sessions", resourceLabel: "terminal sessions", resources }];
  },
  async activate(context) {
    const themeFacade = createLiveOptionalFacade(
      context.observe<UiThemeCapability>(UI_THEME_SERVICE),
      EMPTY_THEME,
    );
    const shortcutsFacade = createLiveOptionalFacade(
      context.observe<ShortcutRegistryCapability>(SHORTCUTS_REGISTRY_SERVICE),
      EMPTY_SHORTCUTS,
    );
    await context.effect(() => async () => {
      await shortcutsFacade.dispose();
      await themeFacade.dispose();
    });
    const theme = themeFacade.value;
    const workspaceTabs = context.get<WorkspaceTabsCapability>("workspace.tabs");
    const git = context.observe<GitCapability>(GIT_REPOSITORY_SERVICE);
    await context.effect(() => git.subscribe(notifyTerminalGitChanged));
    await context.effect(() => configureTerminalSessions(workspaceTabs));
    await context.effect(() =>
      configureTerminalRuntime({
        pty: context.get<PtyCapability>("terminal.pty"),
        history: context.get<ShellHistoryCapability>("terminal.history"),
        files: context.get<WorkspaceFilesCapability>("workspace.files"),
        workspace: context.get<WorkspaceCapability>("workspace.registry"),
        preferences: context.get<PreferencesCapability>("settings.preferences"),
        shortcuts: shortcutsFacade.value,
        theme,
        events: context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
        desktop: context.get<DesktopIntegrationCapability>("desktop.integration"),
        desktopWindow:
          context.get<DesktopWindowCapability>(DESKTOP_WINDOW_SERVICE),
        get git() {
          return git.current() ?? null;
        },
      }),
    );
    await context.effect(startAgentActivityListener);
    await context.effect(startTerminalPreferences);
    await context.effect(installTerminalStyles);
    await context.effect(() => () => {
      for (const leafId of terminalSessions.leafIds()) disposeSession(leafId);
      clearTerminalSessions();
      setActiveTabsRuntime(null);
    });
    await context.effect(() =>
      contributeTerminalAiLive(
        context.get<AiLiveContributionCapability>("ai.live-contributions"),
        context.get<AiLiveCapability>("ai.live"),
        workspaceTabs,
        terminalSessions,
      ),
    );
    context.provide("terminal.sessions", terminalSessions);
    const workspaceFooter: TerminalWorkspaceFooterCapability = {
      create: (composer, environment) =>
        createWorkspaceFooterContribution(
          workspaceTabs,
          theme,
          composer,
          environment,
        ),
    };
    context.provide("terminal.workspace-footer", workspaceFooter);
    await context.effect(() =>
      context
        .get<WorkspaceTabCloseGuardRegistry>(
          WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
        )
        .register(closeGuard),
    );
    await context.effect(() =>
      context
        .get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE)
        .register(terminalTabs, {
          pluginId: "terminal-surface-native",
          generation: context.generation,
          key: "terminal",
        }),
    );
    await context.effect(() =>
      context.get<UiCommandRegistry>(UI_COMMANDS_SERVICE).register(
        commandSource,
        { pluginId: "terminal-surface-native", generation: context.generation, key: commandSource.id },
      ),
    );
  },
};

export default plugin;
