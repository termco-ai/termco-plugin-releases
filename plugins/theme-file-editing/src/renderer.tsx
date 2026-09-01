import { APPLICATION_PATHS_SERVICE, type ApplicationPathsCapability } from "@termco/application-base";
import { DESKTOP_WINDOW_SERVICE, type DesktopWindowCapability } from "@termco/desktop-base";
import { EDITOR_NAVIGATION_SERVICE, type EditorNavigationCapability } from "@termco/editor-base";
import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE, type WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import {
  UI_BACKGROUND_TASKS_SERVICE,
  type UiBackgroundContribution,
  type UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import {
  UI_THEME_SERVICE,
  type ThemeDefinition,
  type UiThemeCapability,
} from "@termco/ui-theme-base";
import {
  WORKSPACE_PRESENTATION_SERVICE,
  WORKSPACE_TABS_SERVICE,
  type WorkspacePresentationCapability,
  type WorkspaceTabsCapability,
} from "@termco/workspace-base";
import ui from "@termco/ui";
import { isThemeFilePath, joinPath, themeFilePath } from "./path";

const { useEffect } = ui.React;

type FileWritten = { path?: unknown; source?: unknown };
type ThemeEdit = { action?: unknown; id?: unknown };
type TextFile = { kind?: unknown; content?: unknown };

function createBackground(
  events: ApplicationEventsCapability,
  files: WorkspaceFilesCapability,
  theme: UiThemeCapability,
  paths: ApplicationPathsCapability,
  presentation: WorkspacePresentationCapability,
  tabs: WorkspaceTabsCapability,
  editor: EditorNavigationCapability,
  window: DesktopWindowCapability,
) {
  return function ThemeFileEditing() {
    useEffect(() => events.subscribe("fs:file-written", (unknownPayload) => {
      const payload = unknownPayload as FileWritten;
      if (payload.source !== "editor" || typeof payload.path !== "string" || !isThemeFilePath(payload.path)) return;
      void (async () => {
        try {
          const current = presentation.snapshot();
          const result = await files.readFile(payload.path as string, current.sidebar.workspace, true) as TextFile;
          if (result.kind !== "text" || typeof result.content !== "string") return;
          let raw: unknown;
          try { raw = JSON.parse(result.content); }
          catch (error) { console.warn("[termco] theme not applied:", error); return; }
          const parsed = theme.validate(raw);
          if (!parsed.ok) { console.warn("[termco] theme not applied:", parsed.error); return; }
          await theme.mutate({ type: "save-custom-theme", theme: parsed.theme });
        } catch (error) {
          console.warn("[termco] theme ingest failed:", error);
        }
      })();
    }), [events, files, presentation, theme]);

    useEffect(() => events.subscribe("termco://theme-edit", (unknownPayload) => {
      const request = unknownPayload as ThemeEdit;
      if (request.action !== "edit" || typeof request.id !== "string") return;
      void (async () => {
        const current = presentation.snapshot();
        const applicationPaths = await paths.getPaths();
        const definition = theme.snapshot().themes.find((candidate) => candidate.id === request.id);
        if (!definition) return;
        const directory = joinPath(applicationPaths.pathSeparator, applicationPaths.appConfigDir, "themes");
        const path = themeFilePath(applicationPaths.appConfigDir, applicationPaths.pathSeparator, definition.id);
        const editorPaths = tabs.snapshot().tabs.flatMap((tab) =>
          tab.kind === "editor" && typeof tab.data?.path === "string"
            ? [tab.data.path]
            : [],
        );
        if (!editorPaths.includes(path)) {
          const exists = await files.stat(directory, current.sidebar.workspace, true).then(() => true).catch(() => false);
          if (!exists) await files.createDir(directory, current.sidebar.workspace);
          await files.writeFile(
            path,
            JSON.stringify(definition as ThemeDefinition, null, 2),
            current.sidebar.workspace,
            "theme",
          );
        }
        await theme.mutate({ type: "set-theme", id: definition.id });
        editor.openFile(path);
        await window.focus();
      })().catch((error) => console.warn("[termco] theme edit failed:", error));
    }), [editor, events, files, paths, presentation, tabs, theme, window]);

    useEffect(() => events.subscribe("termco://theme-delete", (unknownPayload) => {
      const request = unknownPayload as { id?: unknown };
      if (typeof request.id !== "string") return;
      void (async () => {
        const current = presentation.snapshot();
        const applicationPaths = await paths.getPaths();
        const path = themeFilePath(
          applicationPaths.appConfigDir,
          applicationPaths.pathSeparator,
          request.id as string,
        );
        await files.delete(path, current.sidebar.workspace).catch(() => {});
      })();
    }), [events, files, paths, presentation]);

    return null;
  };
}

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_FILES_SERVICE,
    UI_THEME_SERVICE,
    APPLICATION_PATHS_SERVICE,
    WORKSPACE_PRESENTATION_SERVICE,
    WORKSPACE_TABS_SERVICE,
    EDITOR_NAVIGATION_SERVICE,
    DESKTOP_WINDOW_SERVICE,
    UI_BACKGROUND_TASKS_SERVICE,
  ],
  async activate(context) {
    const files = context.get<WorkspaceFilesCapability>(WORKSPACE_FILES_SERVICE);
    const paths = context.get<ApplicationPathsCapability>(APPLICATION_PATHS_SERVICE);
    const presentation = context.get<WorkspacePresentationCapability>(WORKSPACE_PRESENTATION_SERVICE);
    const Component = createBackground(
      context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      files,
      context.get<UiThemeCapability>("ui.theme"),
      paths,
      presentation,
      context.get<WorkspaceTabsCapability>("workspace.tabs"),
      context.get<EditorNavigationCapability>("editor.navigation"),
      context.get<DesktopWindowCapability>("desktop.window"),
    );
    const contribution: UiBackgroundContribution = {
      id: "theme-file-editing",
      label: "Theme file editing",
      description: "Reapplies edited theme files and opens requested themes in the editor.",
      Component,
    };
    await context.effect(() =>
      context.get<UiBackgroundRegistry>(UI_BACKGROUND_TASKS_SERVICE).register(
        contribution,
        { pluginId: "theme-file-editing", generation: context.generation, key: contribution.id },
      ),
    );
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    if (!host.__termco?.e2e) return;
    const description = () => contribution.description;
    const seam = (host.__termcoE2E ??= {});
    seam.themeFileEditingDescription = description;
    return () => {
      if (seam.themeFileEditingDescription === description) {
        delete seam.themeFileEditingDescription;
      }
    };
  },
};

export default plugin;
