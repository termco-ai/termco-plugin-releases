import type { MarkdownNavigationCapability } from "@termco/editor-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiTabDescriptor,
  UiTabKindContribution,
  UiTabKindRegistry,
  UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";
import ui from "@termco/ui";
import { markdownLoadState, type MarkdownLoadState } from "./model";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { WORKSPACE_TABS_SERVICE } from "@termco/workspace-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";

const { useEffect, useState } = ui.React;

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function createMarkdownNavigation(
  tabs: WorkspaceTabsCapability,
): MarkdownNavigationCapability {
  return {
    open(path) {
      const snapshot = tabs.snapshot();
      const existing = snapshot.tabs.find(
        (tab) => tab.kind === "markdown" && tab.data?.path === path,
      );
      if (existing) {
        if (snapshot.splitTabId === existing.id) {
          tabs.transition({ focusedPane: "right" });
        } else {
          tabs.transition({ activeId: existing.id });
        }
        return existing.id;
      }
      const [id] = tabs.allocate(1);
      const record = {
        id,
        kind: "markdown",
        rigId: snapshot.activeRigIdForNewTabs,
        title: basename(path),
        data: { path },
      };
      const nextTabs = [...snapshot.tabs, record];
      if (snapshot.initialized) {
        tabs.transition({ tabs: nextTabs, activeId: id });
      } else {
        tabs.initialize({
          tabs: nextTabs,
          activeId: id,
          splitTabId: 0,
          activeRigIdForNewTabs: record.rigId,
        });
      }
      return id;
    },
  };
}

const toggle = { position: "absolute", right: 12, top: 12, zIndex: 10, display: "inline-flex", gap: 2, border: "1px solid var(--border)", borderRadius: 7, background: "color-mix(in srgb, var(--card) 88%, transparent)", padding: 2 } as const;
const button = { border: 0, borderRadius: 5, background: "var(--accent)", color: "var(--foreground)", cursor: "pointer", padding: "3px 8px", fontSize: 12 } as const;

function createSurface(files: WorkspaceFilesCapability) {
  function Pane({ tab, visible, runtime }: { tab: UiTabDescriptor; visible: boolean; runtime: UiTabSurfaceProps["runtime"] }) {
    const [state, setState] = useState<MarkdownLoadState | { kind: "loading" }>({ kind: "loading" });
    useEffect(() => {
      let cancelled = false;
      setState({ kind: "loading" });
      if (!tab.path) { setState({ kind: "error", message: "Markdown tab has no file path" }); return; }
      void files.readFile(tab.path, runtime.workspace).then(
        (result) => { if (!cancelled) setState(markdownLoadState(result)); },
        (error) => { if (!cancelled) setState({ kind: "error", message: error instanceof Error ? error.message : String(error) }); },
      );
      return () => { cancelled = true; };
    }, [tab.path, runtime.workspace]);
    return <div aria-hidden={!visible} style={{ position: "absolute", inset: 0, display: visible ? "flex" : "none", flexDirection: "column", overflow: "hidden", border: "1px solid var(--border)", borderRadius: 7, background: "var(--background)" }}>
      <div style={toggle}>
        <button type="button" aria-pressed style={button}>Rendered</button>
        <button
          type="button"
          style={{
            ...button,
            background: "transparent",
            color: "var(--muted-foreground)",
          }}
          onClick={() =>
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
            })
          }
        >
          Raw
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {state.kind === "loading" ? <p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Loading…</p> : null}
        {state.kind === "error" ? <p style={{ color: "var(--destructive)", fontSize: 12 }}>Failed to read file: {state.message}</p> : null}
        {state.kind === "binary" ? <p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>Binary file — cannot render as Markdown.</p> : null}
        {state.kind === "toolarge" ? <p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>File is {state.size} bytes; limit {state.limit}.</p> : null}
        {state.kind === "ready" ? <ui.Streamdown className="select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{state.content}</ui.Streamdown> : null}
      </div>
    </div>;
  }

  return function MarkdownSurface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
    const markdownTabs = tabs.filter((tab) => tab.kind === "markdown" && !tab.cold);
    if (markdownTabs.length === 0) return null;
    return <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {markdownTabs.map((tab) => <Pane key={tab.id} tab={tab} visible={tab.id === activeId} runtime={runtime} />)}
    </div>;
  };
}

const plugin: PluginModule = {
  inject: [
    WORKSPACE_TABS_SERVICE,
    WORKSPACE_FILES_SERVICE,
    UI_TABS_KINDS_SERVICE,
  ],
  async activate(context) {
    const navigation = createMarkdownNavigation(
      context.get<WorkspaceTabsCapability>("workspace.tabs"),
    );
    const contribution: UiTabKindContribution = {
      id: "markdown",
      label: "Markdown",
      description: "Rendered Markdown files with a raw-editor switch.",
      kinds: ["markdown"],
      Component: createSurface(context.get<WorkspaceFilesCapability>("workspace.files")),
    };
    await context.effect(() =>
      context
        .get<UiTabKindRegistry>("ui.tabs.kinds")
        .register(contribution, { pluginId: "markdown-surface", generation: context.generation, key: contribution.id }),
    );
    context.provide<MarkdownNavigationCapability>(
      "markdown.navigation",
      navigation,
    );
  },
};

export default plugin;
