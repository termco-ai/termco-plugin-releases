import { AI_SESSIONS_SERVICE, type AiSessionsCapability } from "@termco/ai-sessions-base";
import { EDITOR_SESSIONS_SERVICE, type EditorSessionsCapability } from "@termco/editor-base";
import type { PluginModule } from "@termco/kernel";
import { TERMINAL_SESSIONS_SERVICE, type TerminalSessionsCapability } from "@termco/terminal-base";
import {
  UI_OVERLAYS_SERVICE,
  type UiOverlayContribution,
  type UiOverlayRegistry,
} from "@termco/ui-overlays-base";
import { UI_WORKSPACE_COMPOSER_SERVICE, type UiWorkspaceComposerCapability } from "@termco/ui-workspace-base";
import { WORKSPACE_TABS_SERVICE, type WorkspaceTabsCapability } from "@termco/workspace-base";
import { usePresence } from "@termco/ui";
import { useCallback } from "react";
import { SelectionAskAi } from "./SelectionAskAi";
import { captureActiveSelection } from "./selection";
import { useSelectionAskAi } from "./useSelectionAskAi";

function createOverlay(
  ai: AiSessionsCapability,
  composer: UiWorkspaceComposerCapability,
  tabs: WorkspaceTabsCapability,
  sources: {
    terminal(): TerminalSessionsCapability | undefined;
    editor(): EditorSessionsCapability | undefined;
  },
) {
  return function SelectionAskAiOverlay() {
    const capture = useCallback(
      () => captureActiveSelection(tabs, sources.terminal(), sources.editor()),
      [sources, tabs],
    );
    const askFromSelection = useCallback(
      (selection: { text: string; source: "terminal" | "editor" }) => {
        ai.openPanel();
        if (!composer.snapshot().available) return;
        ai.attachSelection(selection.text, selection.source);
      },
      [ai, composer],
    );
    const selection = useSelectionAskAi(capture, askFromSelection);
    const presence = usePresence(Boolean(selection.popup), 120);
    if (!presence.mounted) return null;
    return (
      <SelectionAskAi
        state={presence.state}
        x={selection.popup?.x ?? 0}
        y={selection.popup?.y ?? 0}
        onAsk={selection.ask}
        onDismiss={() => selection.setPopup(null)}
      />
    );
  };
}

const plugin: PluginModule = {
  inject: [
    AI_SESSIONS_SERVICE,
    UI_WORKSPACE_COMPOSER_SERVICE,
    WORKSPACE_TABS_SERVICE,
    UI_OVERLAYS_SERVICE,
  ],
  async activate(context) {
    let terminal: TerminalSessionsCapability | undefined;
    let editor: EditorSessionsCapability | undefined;
    const sources = {
      terminal: () => terminal,
      editor: () => editor,
    };
    context.feature(
      {
        id: "terminal-selection-source",
        label: "Terminal selection source",
        requires: [TERMINAL_SESSIONS_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) => {
        const selected = scope.get<TerminalSessionsCapability>(
          TERMINAL_SESSIONS_SERVICE,
        );
        terminal = selected;
        return () => {
          if (terminal === selected) terminal = undefined;
        };
      },
    );
    context.feature(
      {
        id: "editor-selection-source",
        label: "Editor selection source",
        requires: [EDITOR_SESSIONS_SERVICE],
        uiPolicy: "fallback",
      },
      (scope) => {
        const selected = scope.get<EditorSessionsCapability>(
          EDITOR_SESSIONS_SERVICE,
        );
        editor = selected;
        return () => {
          if (editor === selected) editor = undefined;
        };
      },
    );
    const contribution: UiOverlayContribution = {
      id: "selection-ask-ai",
      label: "Ask AI from selection",
      description: "Attach selected editor or terminal text to the shared AI session.",
      order: 31,
      Component: createOverlay(
        context.get<AiSessionsCapability>("ai.sessions"),
        context.get<UiWorkspaceComposerCapability>("ui.workspace-composer"),
        context.get<WorkspaceTabsCapability>("workspace.tabs"),
        sources,
      ),
    };
    await context.effect(() =>
      context.get<UiOverlayRegistry>(UI_OVERLAYS_SERVICE).register(
        contribution,
        { pluginId: "selection-ask-ai-native", generation: context.generation, key: contribution.id },
      ),
    );
  },
};

export default plugin;
