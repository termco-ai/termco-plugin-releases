import type { EditorNavigationCapability } from "@termco/editor-base";
import type {
  WorkspaceFileIconsCapability,
  WorkspaceFilesCapability,
} from "@termco/files-base";
import type {
  ContributionRecord,
  Dispose,
  OptionalCapability,
  PluginModule,
} from "@termco/kernel";
import {
  UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
  type UiChangeRevealAdapter,
  type UiChangeRevealAdapterDirectory,
} from "@termco/ui-change-reveal-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type {
  ShellHistoryCapability,
  TerminalSessionsCapability,
} from "@termco/terminal-base";
import type {
  UiCommandContribution,
  UiCommandItem,
  UiCommandRegistry,
  UiCommandRuntime,
  UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import type {
  UiCommandPaletteCapability,
  UiOverlayContribution,
  UiOverlayRegistry,
} from "@termco/ui-overlays-base";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type {
  WorkspacePresentationCapability,
  WorkspaceRigsCapability,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import ui from "@termco/ui";
import {
  FileSearchIcon,
  PaintBoardIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { CommandPalette } from "./palette/CommandPalette";
import type { PaletteItem } from "./palette/types";
import { collectCommandContributions } from "./model";
import { useCommandPaletteShortcuts } from "./useCommandPaletteShortcuts";
import { EDITOR_NAVIGATION_SERVICE } from "@termco/editor-base";
import {
  WORKSPACE_FILE_ICONS_SERVICE,
  WORKSPACE_FILES_SERVICE,
} from "@termco/files-base";
import { SHORTCUTS_REGISTRY_SERVICE } from "@termco/shortcuts-base";
import {
  TERMINAL_HISTORY_SERVICE,
  TERMINAL_SESSIONS_SERVICE,
} from "@termco/terminal-base";
import { UI_COMMANDS_SERVICE } from "@termco/ui-commands-base";
import {
  UI_COMMAND_PALETTE_SERVICE,
  UI_OVERLAYS_SERVICE,
} from "@termco/ui-overlays-base";
import { UI_SIDEBAR_NAVIGATION_SERVICE } from "@termco/ui-sidebar-base";
import { UI_THEME_SERVICE } from "@termco/ui-theme-base";
import {
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_RIGS_SERVICE,
  WORKSPACE_TABS_SERVICE,
} from "@termco/workspace-base";

const NO_SUBSCRIBE = () => () => {};
const stableSnapshot = <T,>(snapshot: T) => () => snapshot;
const EMPTY_PRESENTATION: WorkspacePresentationCapability = {
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
};
const EMPTY_TABS: WorkspaceTabsCapability = {
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
const EMPTY_FILES = {
  grepInteractive: async () => ({ hits: [], truncated: false }),
} as unknown as WorkspaceFilesCapability;
const EMPTY_HISTORY = {
  list: async () => [],
} as unknown as ShellHistoryCapability;
const EMPTY_THEME = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({
    revision: 0,
    mode: "system",
    resolvedMode: "dark",
    themeId: "termco-default",
    themes: [],
    customThemeIds: [],
    editorTheme: "default",
    background: {
      kind: "none",
      imageId: null,
      opacity: 0,
      blur: 0,
    },
  }),
  mutate: async () => ({}),
  validate: () => ({ ok: false, error: "Theme provider unavailable" }),
  resolveEditorTheme: (preference: string) => preference,
} as unknown as UiThemeCapability;
const EMPTY_SHORTCUTS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({ revision: 0, groups: [], shortcuts: [], overrides: {} }),
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
const EMPTY_TERMINALS = {
  write: () => false,
  focus: () => false,
} as unknown as TerminalSessionsCapability;
const EMPTY_EDITOR = {
  openFileAt: () => 0,
} as unknown as EditorNavigationCapability;
const EMPTY_SIDEBAR = {
  show: () => {},
} as unknown as UiSidebarNavigationCapability;
const EMPTY_RIGS = {
  subscribe: NO_SUBSCRIBE,
  snapshot: stableSnapshot({ hydrated: true, rigs: [], activeId: null }),
  cycle: () => {},
  activate: () => {},
} as unknown as WorkspaceRigsCapability;

function useOptionalCapability<T>(
  capability: OptionalCapability<T>,
  fallback: T,
): T {
  return ui.React.useSyncExternalStore(
    capability.subscribe,
    () => capability.current() ?? fallback,
    () => fallback,
  );
}

function paletteItem(
  item: UiCommandItem,
  runtime: UiCommandRuntime,
  owner?: ContributionRecord<UiCommandContribution>,
): PaletteItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    group: item.group,
    keywords: item.keywords ? [...item.keywords] : undefined,
    icon: item.icon,
    shortcutId: item.shortcutId,
    trailing: item.trailing,
    disabledReason: item.disabledReason,
    order: item.order,
    run: () => void item.run(runtime),
    ...(owner
      ? {
          owner: {
            pluginId: owner.pluginId,
            generation: owner.generation,
            key: owner.key,
          },
        }
      : {}),
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else queueMicrotask(resolve);
  });
}

export function createCommandRevealAdapter(
  palette: UiCommandPaletteCapability,
  root: Document,
): UiChangeRevealAdapter {
  return {
    id: "command-palette-reveal",
    services: ["ui.commands"],
    async reveal(request) {
      palette.show("commands");
      palette.setQuery(request.target.key);
      await nextFrame();
      const element = [...root.querySelectorAll<HTMLElement>(
        '[data-contribution-service="ui.commands"]',
      )].find((candidate) =>
        candidate.dataset.pluginOwner === request.target.pluginId &&
        candidate.dataset.pluginGeneration === request.target.generation &&
        candidate.dataset.contributionKey === request.target.key
      );
      return element
        ? {
            status: "revealed",
            target: request.target,
            message: "Command Palette filtered to the exact contributed command without running it.",
            element,
          }
        : {
            status: "not-found",
            target: request.target,
            message: "The exact contributed command is no longer available.",
          };
    },
  };
}

export function focusedTerminalLeaf(
  snapshot: WorkspaceTabsSnapshot,
): number | null {
  const focusedId =
    snapshot.focusedPane === "right" && snapshot.splitTabId !== 0
      ? snapshot.splitTabId
      : snapshot.activeId;
  const tab = snapshot.tabs.find((candidate) => candidate.id === focusedId);
  return tab?.kind === "terminal" &&
    typeof tab.data?.activeLeafId === "number"
    ? tab.data.activeLeafId
    : null;
}

export function createCommandRuntime(
  sidebar: UiSidebarNavigationCapability,
  rigs: WorkspaceRigsCapability,
): UiCommandRuntime {
  return {
    showSidebarView: (id) => sidebar.show(id),
    rigs: () =>
      rigs.snapshot().rigs.map((rig) => ({
        id: rig.id,
        name: rig.name,
        root: rig.root,
        workspaceKind: rig.workspace.kind,
        color: rig.color,
      })),
    activeRigId: () => rigs.snapshot().activeId,
    cycleRig: (delta) => rigs.cycle(delta),
    activateRig: (id) => rigs.activate(id),
  };
}

export function bindExternalStore<T>(provider: {
  subscribe(listener: () => void): () => void;
  snapshot(): T;
}): {
  subscribe(listener: () => void): () => void;
  snapshot(): T;
} {
  return {
    subscribe: (listener) => provider.subscribe(listener),
    snapshot: () => provider.snapshot(),
  };
}

function createOverlay(
  palette: UiCommandPaletteCapability,
  filesCapability: OptionalCapability<WorkspaceFilesCapability>,
  fileIcons: WorkspaceFileIconsCapability,
  historyCapability: OptionalCapability<ShellHistoryCapability>,
  themeCapability: OptionalCapability<UiThemeCapability>,
  shortcutsCapability: OptionalCapability<ShortcutRegistryCapability>,
  registry: UiCommandRegistry,
  presentationCapability: OptionalCapability<WorkspacePresentationCapability>,
  tabsCapability: OptionalCapability<WorkspaceTabsCapability>,
  terminalsCapability: OptionalCapability<TerminalSessionsCapability>,
  editorCapability: OptionalCapability<EditorNavigationCapability>,
  sidebarCapability: OptionalCapability<UiSidebarNavigationCapability>,
  rigsCapability: OptionalCapability<WorkspaceRigsCapability>,
) {
  const paletteStore = bindExternalStore(palette);
  return function CommandPaletteOverlay() {
    const files = useOptionalCapability(filesCapability, EMPTY_FILES);
    const history = useOptionalCapability(historyCapability, EMPTY_HISTORY);
    const theme = useOptionalCapability(themeCapability, EMPTY_THEME);
    const shortcuts = useOptionalCapability(
      shortcutsCapability,
      EMPTY_SHORTCUTS,
    );
    const presentation = useOptionalCapability(
      presentationCapability,
      EMPTY_PRESENTATION,
    );
    const tabs = useOptionalCapability(tabsCapability, EMPTY_TABS);
    const terminals = useOptionalCapability(
      terminalsCapability,
      EMPTY_TERMINALS,
    );
    const editor = useOptionalCapability(editorCapability, EMPTY_EDITOR);
    const sidebar = useOptionalCapability(sidebarCapability, EMPTY_SIDEBAR);
    const rigs = useOptionalCapability(rigsCapability, EMPTY_RIGS);
    const commandRuntime = ui.React.useMemo(
      () => createCommandRuntime(sidebar, rigs),
      [rigs, sidebar],
    );
    const presentationStore = bindExternalStore(presentation);
    const tabsStore = bindExternalStore(tabs);
    useCommandPaletteShortcuts(palette, shortcuts);
    const snapshot = ui.React.useSyncExternalStore(
      paletteStore.subscribe,
      paletteStore.snapshot,
      paletteStore.snapshot,
    );
    const workspace = ui.React.useSyncExternalStore(
      presentationStore.subscribe,
      presentationStore.snapshot,
      presentationStore.snapshot,
    );
    const tabState = ui.React.useSyncExternalStore(
      tabsStore.subscribe,
      tabsStore.snapshot,
      tabsStore.snapshot,
    );
    const [revision, setRevision] = ui.React.useState(0);
    const [sources, setSources] = ui.React.useState<
      readonly ContributionRecord<UiCommandContribution>[]
    >(() => registry.records());

    ui.React.useEffect(() => {
      const unsubscribe = registry.subscribe(() => {
          setSources(registry.records());
        });
      return () => {
        void unsubscribe();
      };
    }, [registry]);

    ui.React.useEffect(() => {
      const refresh = () => setRevision((n) => n + 1);
      const disposers = sources.flatMap(({ value }) =>
        "commands" in value && value.subscribe ? [value.subscribe(refresh)] : [],
      );
      return () => {
        for (const dispose of disposers) dispose();
      };
    }, [sources]);

    const commandItems = ui.React.useMemo(() => {
      if (!snapshot.open) return [];
      const own: UiCommandItem[] = [
        ...(themeCapability.current() ? [{
          id: "theme.pick",
          title: "Change theme...",
          description: "Browse, preview, and activate an application theme.",
          group: "General",
          keywords: ["theme", "appearance", "color", "dark", "light"],
          icon: PaintBoardIcon,
          run: () => palette.show("themes"),
        } satisfies UiCommandItem] : []),
        ...(filesCapability.current() ? [{
          id: "search.content",
          title: "Find content in files",
          description: "Search text across files in the active workspace.",
          group: "Search",
          keywords: ["grep", "ripgrep", "text", "contents", "search in files"],
          icon: FileSearchIcon,
          trailing: "#",
          run: () => palette.show("content"),
        } satisfies UiCommandItem] : []),
        ...(historyCapability.current() ? [{
          id: "history.open",
          title: "Search command history",
          description: "Find and insert a previous command into the active terminal.",
          group: "Search",
          keywords: ["history", "shell", "rerun", "previous commands"],
          icon: TerminalIcon,
          trailing: ">",
          run: () => palette.show("history"),
        } satisfies UiCommandItem] : []),
      ];
      const ownSource: UiCommandSourceContribution = {
        id: "command-palette",
        order: 50,
        commands: () => own,
      };
      const contributed = [...sources].sort(
        (left, right) =>
          (left.value.order ?? 0) - (right.value.order ?? 0),
      ).flatMap((record) =>
        collectCommandContributions([record.value], commandRuntime).map((item) =>
          paletteItem(item, commandRuntime, record)
        )
      );
      return [
        ...contributed,
        ...collectCommandContributions([ownSource], commandRuntime).map((item) =>
          paletteItem(item, commandRuntime)
        ),
      ];
    }, [
      commandRuntime,
      files,
      history,
      palette,
      revision,
      snapshot.open,
      sources,
      theme,
      workspace.revision,
    ]);

    const activeLeafId = focusedTerminalLeaf(tabState);

    return (
      <CommandPalette
        open={snapshot.open}
        onOpenChange={palette.setOpen}
        initialMode={snapshot.mode}
        query={snapshot.query}
        onQueryChange={palette.setQuery}
        commandItems={commandItems}
        workspaceRoot={workspace.sidebar.rootPath}
        workspace={workspace.sidebar.workspace}
        onOpenContentHit={(path, line) => editor.openFileAt(path, line)}
        insertCommand={
          activeLeafId === null
            ? null
            : (command) => {
                if (!terminals.write(activeLeafId, command)) return;
                terminals.focus(activeLeafId);
              }
        }
        inputSlot={snapshot.inputSlot}
        anchor={snapshot.anchor}
        files={files}
        fileIcons={fileIcons}
        historyProvider={history}
        shortcuts={shortcuts}
        theme={theme}
      />
    );
  };
}

const plugin: PluginModule = {
  inject: [
    UI_COMMAND_PALETTE_SERVICE,
    UI_COMMANDS_SERVICE,
    UI_OVERLAYS_SERVICE,
  ],
  optionalInject: [
    UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
    WORKSPACE_FILES_SERVICE,
    TERMINAL_HISTORY_SERVICE,
    UI_THEME_SERVICE,
    SHORTCUTS_REGISTRY_SERVICE,
    WORKSPACE_PRESENTATION_SERVICE,
    WORKSPACE_TABS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
    EDITOR_NAVIGATION_SERVICE,
    UI_SIDEBAR_NAVIGATION_SERVICE,
    WORKSPACE_RIGS_SERVICE,
    WORKSPACE_FILE_ICONS_SERVICE,
  ],
  async activate(context) {
    const revealAdapter = createCommandRevealAdapter(
      context.get<UiCommandPaletteCapability>(UI_COMMAND_PALETTE_SERVICE),
      document,
    );
    await context.effect(() => {
      const observed = context.observe<UiChangeRevealAdapterDirectory>(
        UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
      );
      let disposeRegistration: Dispose | undefined;
      const bind = () => {
        void disposeRegistration?.();
        disposeRegistration = observed.current()?.register(revealAdapter, {
          pluginId: context.pluginId,
          generation: context.generation,
          key: revealAdapter.id,
        });
      };
      const disposeObservation = observed.subscribe(bind);
      bind();
      return async () => {
        await disposeRegistration?.();
        await disposeObservation();
      };
    });
    const observedFileIcons = context.observe<WorkspaceFileIconsCapability>(
      WORKSPACE_FILE_ICONS_SERVICE,
    );
    const fileIcons: WorkspaceFileIconsCapability = {
      fileIconUrl: (name) => observedFileIcons.current()?.fileIconUrl(name) ?? "",
      folderIconUrl: (name, expanded) =>
        observedFileIcons.current()?.folderIconUrl(name, expanded) ?? "",
    };
    const palette = context.get<UiCommandPaletteCapability>(
      "ui.command-palette",
    );
    const contribution: UiOverlayContribution = {
      id: "command-palette",
      label: "Command palette",
      description: "Categorized command, content, history, and theme search.",
      Component: createOverlay(
        palette,
        context.observe<WorkspaceFilesCapability>(WORKSPACE_FILES_SERVICE),
        fileIcons,
        context.observe<ShellHistoryCapability>(TERMINAL_HISTORY_SERVICE),
        context.observe<UiThemeCapability>(UI_THEME_SERVICE),
        context.observe<ShortcutRegistryCapability>(SHORTCUTS_REGISTRY_SERVICE),
        context.get<UiCommandRegistry>("ui.commands"),
        context.observe<WorkspacePresentationCapability>(
          WORKSPACE_PRESENTATION_SERVICE,
        ),
        context.observe<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE),
        context.observe<TerminalSessionsCapability>(TERMINAL_SESSIONS_SERVICE),
        context.observe<EditorNavigationCapability>(EDITOR_NAVIGATION_SERVICE),
        context.observe<UiSidebarNavigationCapability>(
          UI_SIDEBAR_NAVIGATION_SERVICE,
        ),
        context.observe<WorkspaceRigsCapability>(WORKSPACE_RIGS_SERVICE),
      ),
    };
    await context.effect(() =>
      context.get<UiOverlayRegistry>("ui.overlays").register(contribution, {
        pluginId: "command-palette-native",
        generation: context.generation,
        key: contribution.id,
      }),
    );
  },
};

export default plugin;
