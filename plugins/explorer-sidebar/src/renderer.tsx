import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  UiFileIconsCapability,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type { GitCapability, GitStatusSnapshot } from "@termco/git-base";
import { createLiveOptionalFacade, type PluginModule } from "@termco/kernel";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { TerminalBlockOpenFolder } from "@termco/terminal-base";
import type {
  UiCommandContribution,
  UiCommandRegistry,
} from "@termco/ui-commands-base";
import type {
  UiSidebarNavigationCapability,
  UiSidebarViewContribution,
  UiSidebarViewController,
  UiSidebarViewProps,
  UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import ui from "@termco/ui";
import {
  FileExplorer,
  type FileExplorerHandle,
} from "./explorer/FileExplorer";
import { ExplorerIcon } from "./icon";
import { fileIconUrl, folderIconUrl } from "./explorer/lib/iconResolver";
import { isUnder } from "./model";
import {
  explorerGitSnapshot,
  explorerRuntime,
  notifyExplorerGitChanged,
  startExplorerRuntime,
  subscribeExplorerGit,
  type ExplorerRuntime,
} from "./runtime";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import {
  UI_FILE_ICONS_SERVICE,
  WORKSPACE_FILES_SERVICE,
} from "@termco/files-base";
import { GIT_REPOSITORY_SERVICE } from "@termco/git-base";
import { SHORTCUTS_REGISTRY_SERVICE } from "@termco/shortcuts-base";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";
import { UI_SIDEBAR_NAVIGATION_SERVICE } from "@termco/ui-sidebar-base";
import { UI_COMMANDS_SERVICE } from "@termco/ui-commands-base";
import { UI_SIDEBAR_VIEWS_SERVICE } from "@termco/ui-sidebar-base";

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

function createController() {
  let handle: FileExplorerHandle | null = null;
  let pendingReveal: string | null = null;
  const controller: UiSidebarViewController = {
    focus: () => handle?.focus(),
    isFocused: () => handle?.isFocused() ?? false,
    focusSearch: () => handle?.focusSearch(),
    revealPath(path) {
      if (handle) handle.revealPath(path);
      else pendingReveal = path;
    },
  };
  return {
    controller,
    mount(next: FileExplorerHandle | null) {
      handle = next;
      if (handle && pendingReveal) {
        handle.revealPath(pendingReveal);
        pendingReveal = null;
      }
    },
  };
}

function useGitStatus(
  rootPath: string | null,
  workspace: UiSidebarViewProps["workspace"],
): GitStatusSnapshot | null {
  const [status, setStatus] = ui.React.useState<GitStatusSnapshot | null>(null);
  const gitAvailability = ui.React.useSyncExternalStore(
    subscribeExplorerGit,
    explorerGitSnapshot,
    explorerGitSnapshot,
  );

  ui.React.useEffect(() => {
    let active = true;
    let refreshTimer: number | null = null;
    const refresh = async () => {
      const git = explorerRuntime().git;
      if (!rootPath || !git) {
        setStatus(null);
        return;
      }
      try {
        const panel = await git.panelSnapshot(rootPath, workspace);
        if (active) setStatus(panel.status);
      } catch {
        if (active) setStatus(null);
      }
    };
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refresh(), 120);
    };
    void refresh();
    const offFiles = explorerRuntime().events.subscribe(
      "fs:changed",
      scheduleRefresh,
    );
    window.addEventListener("focus", scheduleRefresh);
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      offFiles();
      window.removeEventListener("focus", scheduleRefresh);
      window.clearInterval(interval);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [rootPath, workspace, gitAvailability]);

  return status;
}

function createExplorer(
  control: ReturnType<typeof createController>,
  onRoot: (root: string | null) => void,
) {
  return function Explorer(props: UiSidebarViewProps) {
    onRoot(props.rootPath);
    const gitStatus = useGitStatus(props.rootPath, props.workspace);
    return (
      <FileExplorer
        ref={control.mount}
        rootPath={props.rootPath}
        env={props.workspace}
        activeFilePath={props.activeFilePath}
        gitStatus={gitStatus}
        onOpenFile={props.openFile}
        onPathRenamed={props.pathRenamed}
        onPathDeleted={props.pathDeleted}
        onRevealInTerminal={props.navigateToPath}
        onAttachToAgent={props.attachFileToAgent}
      />
    );
  };
}

export function installTerminalFolderNavigation(
  events: ApplicationEventsCapability,
  navigation: UiSidebarNavigationCapability,
  controller: UiSidebarViewController,
  currentRoot: () => string | null,
  desktop: DesktopIntegrationCapability,
): () => void {
  return events.subscribe(TERMINAL_BLOCK_EVENTS.openFolder, (payload) => {
    const { path, env } = payload as TerminalBlockOpenFolder;
    if (!path) return;
    const root = currentRoot();
    if (root && isUnder(path, root)) {
      navigation.select("explorer");
      controller.revealPath(path);
      return;
    }
    if (!env || env.kind === "local") desktop.revealItem(path);
  });
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_FILES_SERVICE,
    UI_FILE_ICONS_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_SIDEBAR_NAVIGATION_SERVICE,
    UI_COMMANDS_SERVICE,
    UI_SIDEBAR_VIEWS_SERVICE,
  ],
  optionalInject: [GIT_REPOSITORY_SERVICE, SHORTCUTS_REGISTRY_SERVICE],
  async activate(context) {
    let currentRoot: string | null = null;
    const git = context.observe<GitCapability>(GIT_REPOSITORY_SERVICE);
    await context.effect(() => git.subscribe(notifyExplorerGitChanged));
    const shortcuts = createLiveOptionalFacade(
      context.observe<ShortcutRegistryCapability>(SHORTCUTS_REGISTRY_SERVICE),
      EMPTY_SHORTCUTS,
    );
    await context.effect(() => shortcuts.dispose);
    const runtime: ExplorerRuntime = {
      files: context.get<WorkspaceFilesCapability>("workspace.files"),
      preferences:
        context.get<PreferencesCapability>("settings.preferences"),
      desktop: context.get<DesktopIntegrationCapability>("desktop.integration"),
      events: context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      get git() {
        return git.current() ?? null;
      },
      shortcuts: shortcuts.value,
    };
    await context.effect(() => startExplorerRuntime(runtime));
    await context.effect(() =>
      context.get<UiFileIconsCapability>(UI_FILE_ICONS_SERVICE).registerResolver({
        id: "explorer.catalogue",
        priority: 100,
        fileIconUrl,
        folderIconUrl,
      }),
    );
    const control = createController();
    const contribution: UiSidebarViewContribution = {
      id: "explorer",
      label: "Files",
      description: "Browse and modify files in the active workspace.",
      order: 0,
      icon: ExplorerIcon,
      controller: control.controller,
      Component: createExplorer(control, (root) => {
        currentRoot = root;
      }),
    };
    await context.effect(() =>
      context
        .get<UiSidebarViewRegistry>("ui.sidebar.views")
        .register(contribution, { pluginId: "explorer-sidebar", generation: context.generation, key: contribution.id }),
    );
    await context.effect(() =>
      installTerminalFolderNavigation(
        runtime.events,
        context.get<UiSidebarNavigationCapability>("ui.sidebar-navigation"),
        control.controller,
        () => currentRoot,
        runtime.desktop,
      ),
    );

    const command: UiCommandContribution = {
      id: "explorer.search",
      title: "Search files by name",
      description: "Open Explorer and focus its filename search.",
      group: "Search",
      keywords: ["explorer", "workspace", "file", "open"],
      shortcutId: "explorer.search",
      order: 45,
      icon: ExplorerIcon,
      run(runtime) {
        runtime.showSidebarView("explorer");
        requestAnimationFrame(() => control.controller.focusSearch());
      },
    };
    await context.effect(() =>
      context.get<UiCommandRegistry>("ui.commands").register(command, {
        pluginId: "explorer-sidebar",
        generation: context.generation,
        key: command.id,
      }),
    );
  },
};

export default plugin;
