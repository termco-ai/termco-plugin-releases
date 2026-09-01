import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type {
  EditorLanguagesCapability,
  EditorLspStatusCapability,
  EditorNavigationCapability,
  EditorSessionsCapability,
  LspSessionsCapability,
} from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type { PreferencesCapability } from "@termco/storage-base";
import type {
  UiCommandItem,
  UiCommandRegistry,
  UiCommandSourceContribution,
} from "@termco/ui-commands-base";
import type {
  UiOverlayContribution,
  UiOverlayRegistry,
} from "@termco/ui-overlays-base";
import type {
  UiTabDescriptor,
  UiTabKindContribution,
  UiTabKindRegistry,
  UiTabSearchHandle,
  UiTabsRuntime,
  UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type {
  WorkspacePresentationCapability,
  WorkspaceTabCloseGuardContribution,
  WorkspaceTabCloseGuardRegistry,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { FileEditIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { EditorStack, NewEditorDialog, type EditorPaneHandle, useEditorFileSync } from "./editor";
import { configureEditorRuntime, setCurrentWorkspace } from "./runtime";
import {
  configureEditorNavigation,
  editorNavigation,
  newFileOpen,
  setNewFileOpen,
  subscribeNewFile,
} from "./newFile";
import { startEditorPreferences } from "./preferences";
import {
  clearEditorSessions,
  dirtyEditorSessions,
  editorSessionHandle,
  editorSessions,
  registerEditorSession,
  setEditorSessionDirty,
} from "./sessions";
import type { AiDiffTab, EditorTab, Tab } from "./tabs";
import {
  ALL_LANGUAGES,
  EXPOSED_LANGUAGES,
} from "./editor/lib/languageDefinitions";
import { resolveDisplayName } from "./editor/lib/languageResolver";
import { editorLspStatus } from "./editor/lib/lsp/statusStore";
import { isMarkdownPath } from "./utils";
import { installTerminalFileNavigation } from "./terminalFileNavigation";
import { AI_INFERENCE_SERVICE } from "@termco/ai-inference-base";
import { LSP_SESSIONS_SERVICE } from "@termco/editor-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { SETTINGS_PREFERENCES_SERVICE } from "@termco/storage-base";
import { UI_COMMANDS_SERVICE } from "@termco/ui-commands-base";
import { UI_OVERLAYS_SERVICE } from "@termco/ui-overlays-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";
import { UI_THEME_SERVICE } from "@termco/ui-theme-base";
import {
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
  WORKSPACE_TABS_SERVICE,
} from "@termco/workspace-base";
function editorTab(tab: UiTabDescriptor, runtime: UiTabsRuntime): EditorTab | null {
  if (tab.kind !== "editor" || !tab.path) return null;
  const data = tab.data ?? {};
  return {
    id: tab.id,
    rigId: tab.rigId,
    kind: "editor",
    title: tab.title,
    path: tab.path,
    dirty: data.dirty === true,
    preview: data.preview === true,
    cold: tab.cold,
    overrideLanguage: typeof data.overrideLanguage === "string" ? data.overrideLanguage : null,
    workspace: runtime.workspaceForRig(tab.rigId),
    rigRoot: runtime.rootPathForRig(tab.rigId),
  };
}

function syncTab(tab: UiTabDescriptor, runtime: UiTabsRuntime): Tab | null {
  const editor = editorTab(tab, runtime);
  if (editor) return editor;
  if (tab.kind !== "ai-diff" || !tab.path) return null;
  const data = tab.data ?? {};
  if (
    typeof data.approvalId !== "string" ||
    !["pending", "approved", "rejected"].includes(String(data.status))
  ) return null;
  return {
    id: tab.id,
    rigId: tab.rigId,
    kind: "ai-diff",
    title: tab.title,
    path: tab.path,
    approvalId: data.approvalId,
    status: data.status as AiDiffTab["status"],
  };
}

const editorSearchHandles = new WeakMap<EditorPaneHandle, UiTabSearchHandle>();

function searchHandle(handle: EditorPaneHandle): UiTabSearchHandle {
  const existing = editorSearchHandles.get(handle);
  if (existing) return existing;
  const search: UiTabSearchHandle = {
    setQuery(query) { handle.setQuery(query); },
    clearQuery() { handle.clearQuery(); },
    findNext(query) {
      handle.setQuery(query);
      handle.findNext();
    },
    findPrevious(query) {
      handle.setQuery(query);
      handle.findPrevious();
    },
    focus: handle.focus,
  };
  editorSearchHandles.set(handle, search);
  return search;
}

function setMarkdownView(
  runtime: UiTabsRuntime,
  id: number,
  mode: "rendered" | "raw",
): void {
  const tab = runtime.allTabs().find((candidate) => candidate.id === id);
  if (!tab?.path || !isMarkdownPath(tab.path)) return;
  if (mode === "raw" && tab.kind === "markdown") {
    runtime.replaceTab({
      ...tab,
      kind: "editor",
      data: {
        dirty: false,
        preview: false,
        overrideLanguage:
          typeof tab.data?.overrideLanguage === "string"
            ? tab.data.overrideLanguage
            : null,
      },
    });
    return;
  }
  if (
    mode === "rendered" &&
    tab.kind === "editor" &&
    tab.data?.dirty !== true
  ) {
    runtime.replaceTab({
      ...tab,
      kind: "markdown",
      data: {
        overrideLanguage:
          typeof tab.data?.overrideLanguage === "string"
            ? tab.data.overrideLanguage
            : null,
      },
    });
  }
}

export function EditorSurface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
  setCurrentWorkspace(runtime.workspace);
  const editors = useMemo(
    () => tabs.map((tab) => editorTab(tab, runtime)).filter((tab): tab is EditorTab => tab !== null),
    [runtime, tabs],
  );
  const synchronized = useMemo(
    () => runtime.allTabs().map((tab) => syncTab(tab, runtime)).filter((tab): tab is Tab => tab !== null),
    [runtime, tabs],
  );
  const tabsRef = useRef(synchronized);
  tabsRef.current = synchronized;
  const editorRefs = useRef(new Map<number, EditorPaneHandle>());
  editorRefs.current.clear();
  for (const id of editorSessions.ids()) {
    const handle = editorSessionHandle(id);
    if (handle) editorRefs.current.set(id, handle);
  }
  useEditorFileSync({ tabs: synchronized, tabsRef, editorRefs, env: runtime.workspace });

  useEffect(() => {
    const active = editorSessionHandle(activeId);
    runtime.registerSearchHandle(active ? searchHandle(active) : null);
    return () => runtime.registerSearchHandle(null);
  }, [activeId, editors, runtime]);

  return <EditorStack
    tabs={editors}
    activeId={activeId}
    registerHandle={(id, handle) => {
      registerEditorSession(id, handle);
    }}
    onDirtyChange={(id, dirty) => {
      const tab = editors.find((candidate) => candidate.id === id);
      setEditorSessionDirty(id, dirty, tab?.path ?? "", tab?.title ?? "Untitled editor");
      runtime.updateTab(id, { dirty });
    }}
    onCloseTab={(id) => runtime.closeTab(id)}
    onSetMarkdownView={(id, mode) => setMarkdownView(runtime, id, mode)}
    onOpenFileAt={(path, line, character) => {
      runtime.openTab("editor", { path, line, character, pin: true });
    }}
  />;
}

function editorCloseVerdict(tab: {
  title: string;
  data?: Readonly<Record<string, unknown>>;
}) {
  if (tab.data?.dirty !== true) return "close" as const;
  return {
    prompt: {
      title: "Unsaved Changes",
      body: tab.title
        ? `"${tab.title}" has unsaved changes. Close anyway?`
        : "This file has unsaved changes. Close anyway?",
      confirmLabel: "Close Anyway",
    },
  };
}

const closeGuard: WorkspaceTabCloseGuardContribution = {
  id: "editor",
  kinds: ["editor"],
  canClose: editorCloseVerdict,
};

const tabKind: UiTabKindContribution = {
  id: "editor",
  label: "Editor",
  description: "Language-aware workspace file editing with LSP and formatting.",
  kinds: ["editor"],
  mountWhen: "always",
  Component: EditorSurface,
  canClose(tab) {
    return editorCloseVerdict(tab);
  },
};

const commands: UiCommandItem[] = [{
  id: "tab.newEditor",
  title: "New editor tab",
  description: "Create a workspace file and open it in the editor.",
  group: "Tabs",
  keywords: ["file", "editor", "create"],
  shortcutId: "tab.newEditor",
  icon: FileEditIcon,
  run: () => editorNavigation.openNewFile(),
}];

const commandSource: UiCommandSourceContribution = {
  id: "editor",
  order: 20,
  commands: () => commands,
};

export function createNewFileOverlay(
  presentation: WorkspacePresentationCapability,
): UiOverlayContribution {
  const subscribePresentation = (listener: () => void) =>
    presentation.subscribe(listener);
  const presentationSnapshot = () => presentation.snapshot();
  const NewFileOverlay = () => {
    const workspace = useSyncExternalStore(
      subscribePresentation,
      presentationSnapshot,
      presentationSnapshot,
    );
    setCurrentWorkspace(workspace.sidebar.workspace);
    const open = useSyncExternalStore(
      subscribeNewFile,
      newFileOpen,
      () => false,
    );
    return <NewEditorDialog
      open={open}
      onOpenChange={setNewFileOpen}
      rootPath={workspace.sidebar.rootPath ?? workspace.context.home}
      onCreated={(path) => editorNavigation.openFileAt(path, 1)}
    />;
  };
  return {
    id: "editor-new-file",
    label: "New workspace file",
    description: "Create a file and open it in the editor.",
    Component: NewFileOverlay,
  };
}

const editorLanguages: EditorLanguagesCapability = {
  all: () => ALL_LANGUAGES,
  common: () => EXPOSED_LANGUAGES,
  displayName: resolveDisplayName,
};

const plugin: PluginModule = {
  replacementImpact() {
    const resources = dirtyEditorSessions();
    return resources.length === 0
      ? []
      : [{ capability: "editor.sessions", resourceLabel: "unsaved editor buffers", resources }];
  },
  inject: [
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_FILES_SERVICE,
    WORKSPACE_PRESENTATION_SERVICE,
    LSP_SESSIONS_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    UI_THEME_SERVICE,
    AI_INFERENCE_SERVICE,
    WORKSPACE_TABS_SERVICE,
    UI_COMMANDS_SERVICE,
    UI_OVERLAYS_SERVICE,
    UI_TABS_KINDS_SERVICE,
    WORKSPACE_TAB_CLOSE_GUARDS_SERVICE,
  ],
  async activate(context) {
    const events = context.get<ApplicationEventsCapability>(
      EVENTS_APPLICATION_SERVICE,
    );
    const files = context.get<WorkspaceFilesCapability>("workspace.files");
    const presentation = context.get<WorkspacePresentationCapability>(
      "workspace.presentation",
    );
    await context.effect(() =>
      configureEditorRuntime({
        files,
        lsp: context.get<LspSessionsCapability>("lsp.sessions"),
        preferences: context.get<PreferencesCapability>("settings.preferences"),
        theme: context.get<UiThemeCapability>("ui.theme"),
        events,
        inference: context.get<AiInferenceCapability>("ai.inference"),
      }),
    );
    await context.effect(startEditorPreferences);
    await context.effect(() =>
      configureEditorNavigation(
        context.get<WorkspaceTabsCapability>("workspace.tabs"),
        editorSessions,
      ),
    );
    await context.effect(() =>
      installTerminalFileNavigation(
        events,
        files,
        editorNavigation,
        () => presentation.snapshot().sidebar.workspace,
      ),
    );
    await context.effect(() => () => {
      setNewFileOpen(false);
      clearEditorSessions();
    });
    context.provide<EditorSessionsCapability>("editor.sessions", editorSessions);
    context.provide<EditorNavigationCapability>(
      "editor.navigation",
      editorNavigation,
    );
    context.provide<EditorLanguagesCapability>("editor.languages", editorLanguages);
    context.provide<EditorLspStatusCapability>("editor.lsp-status", editorLspStatus);
    await context.effect(() =>
      context
        .get<WorkspaceTabCloseGuardRegistry>("workspace.tab-close-guards")
        .register(closeGuard),
    );
    await context.effect(() =>
      context.get<UiTabKindRegistry>("ui.tabs.kinds").register(tabKind, {
        pluginId: "editor-surface-native",
        generation: context.generation,
        key: tabKind.id,
      }),
    );
    await context.effect(() =>
      context.get<UiCommandRegistry>("ui.commands").register(commandSource, {
        pluginId: "editor-surface-native",
        generation: context.generation,
        key: commandSource.id,
      }),
    );
    await context.effect(() =>
      context
        .get<UiOverlayRegistry>("ui.overlays")
        .register(createNewFileOverlay(presentation), {
          pluginId: "editor-surface-native",
          generation: context.generation,
          key: "new-file-overlay",
        }),
    );
  },
};

export default plugin;
