import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { WorkspaceFileIconsCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import {
  createLiveOptionalFacade,
  type Dispose,
  type PluginModule,
} from "@termco/kernel";
import type {
  UiTabKindContribution,
  UiTabKindRegistry,
  UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import { GitDiffStack } from "./baseline/git-diff/components/GitDiffStack";
import {
  invalidateExternalDiffKey,
  invalidateRepoDiffs,
} from "./baseline/git-diff/lib/diffCache";
import { GitHistoryStack } from "./baseline/git-history/components/GitHistoryStack";
import { installGitSurfaceRuntime } from "./runtime";
import { toGitTabs } from "./tabs";
import { useCallback } from "react";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { WORKSPACE_FILE_ICONS_SERVICE } from "@termco/files-base";
import { GIT_REPOSITORY_SERVICE } from "@termco/git-base";
import { UI_THEME_SERVICE } from "@termco/ui-theme-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";

function GitDiffSurface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
  return (
    <GitDiffStack
      tabs={toGitTabs(tabs, runtime)}
      activeId={activeId}
    />
  );
}

export function GitHistorySurface({ tabs, activeId, runtime }: UiTabSurfaceProps) {
  const registerSearchHandle = runtime.registerSearchHandle;
  const onSearchHandle = useCallback(
    (handle: Parameters<typeof registerSearchHandle>[0]) =>
      registerSearchHandle(handle),
    [registerSearchHandle],
  );
  return (
    <GitHistoryStack
      tabs={toGitTabs(tabs, runtime)}
      activeId={activeId}
      onOpenCommitFile={(input) =>
        runtime.openTab("git-commit-file", input)
      }
      onSearchHandle={onSearchHandle}
    />
  );
}

function installDiffInvalidation(): () => void {
  const onInvalidated = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object") return;
    const { repoRoot, key } = detail as { repoRoot?: unknown; key?: unknown };
    if (typeof repoRoot === "string") invalidateRepoDiffs(repoRoot);
    if (typeof key === "string") invalidateExternalDiffKey(key);
  };
  window.addEventListener("termco:git-diff-invalidated", onInvalidated);
  return () =>
    window.removeEventListener("termco:git-diff-invalidated", onInvalidated);
}

const plugin: PluginModule = {
  inject: [UI_TABS_KINDS_SERVICE],
  optionalInject: [
    GIT_REPOSITORY_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    UI_THEME_SERVICE,
    WORKSPACE_FILE_ICONS_SERVICE,
  ],
  async activate(context) {
    const facades: Array<{ dispose: Dispose }> = [];
    const live = <T extends object>(service: string, fallback: T): T => {
      const facade = createLiveOptionalFacade(context.observe<T>(service), fallback);
      facades.push(facade);
      return facade.value;
    };
    const desktop = live<DesktopIntegrationCapability>(
      DESKTOP_INTEGRATION_SERVICE,
      {
        openUrl: async () => {},
        openPath: async () => {},
        revealItem: () => {},
        relaunch: () => {},
        exit: () => {},
        setAutostart: () => {},
        autostartEnabled: () => false,
        readClipboardText: () => "",
        writeClipboardText: () => {},
        notify: () => {},
        log: () => {},
        subscribeDragDrop: () => () => {},
      },
    );
    const fileIcons = live<WorkspaceFileIconsCapability>(
      WORKSPACE_FILE_ICONS_SERVICE,
      { fileIconUrl: () => "", folderIconUrl: () => "" },
    );
    const theme = live<UiThemeCapability>(UI_THEME_SERVICE, {
      Root: ({ children }) => children,
      snapshot: () => ({
        revision: 0,
        mode: "system",
        resolvedMode: "dark",
        themeId: "",
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
      subscribe: () => () => {},
      mutate: async () => ({}),
      validate: () => ({ ok: false, error: "Theme provider unavailable" }),
      resolveEditorTheme: (preference) => preference,
    });
    await context.effect(() => async () => {
      for (const facade of facades.reverse()) await facade.dispose();
    });

    context.feature(
      {
        id: "git-tabs",
        label: "Git diff and history tabs",
        requires: [GIT_REPOSITORY_SERVICE],
        uiPolicy: "remove",
      },
      async (scope) => {
        await scope.effect(() =>
          installGitSurfaceRuntime({
            git: scope.get<GitCapability>(GIT_REPOSITORY_SERVICE),
            desktop,
            fileIcons,
            theme,
          }),
        );
        await scope.effect(installDiffInvalidation);
        const diff: UiTabKindContribution = {
          id: "git-diff",
          label: "Git Diffs",
          description:
            "Working-tree and commit-file comparisons with the established merge viewer.",
          kinds: ["git-diff", "git-commit-file"],
          mountWhen: "whenOpen",
          Component: GitDiffSurface,
        };
        const history: UiTabKindContribution = {
          id: "git-history",
          label: "Git History",
          description:
            "Virtualized, searchable repository history with graph and changed-file drilldown.",
          kinds: ["git-history"],
          mountWhen: "whenOpen",
          Component: GitHistorySurface,
        };
        const registry = scope.get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE);
        await scope.effect(() =>
          registry.register(diff, { pluginId: "git-surface", generation: context.generation, key: diff.id }),
        );
        await scope.effect(() =>
          registry.register(history, { pluginId: "git-surface", generation: context.generation, key: history.id }),
        );
      },
    );
  },
};

export default plugin;
