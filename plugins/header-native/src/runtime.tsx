import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { BrowserTabsCapability } from "@termco/browser-base";
import type { DesktopWindowCapability } from "@termco/desktop-base";
import type {
  EditorNavigationCapability,
  EditorSessionsCapability,
} from "@termco/editor-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";
import type {
  UiHeaderAgentNotification,
  UiHeaderAgentSession,
  UiHeaderRig,
  UiHeaderRuntime,
} from "@termco/ui-header-base";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import type {
  WorkspacePresentationCapability,
  WorkspaceRigsCapability,
  WorkspaceRigWorkflowsCapability,
  WorkspaceTabActionsCapability,
  WorkspaceTabsCapability,
} from "@termco/workspace-base";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface HeaderRuntimeCapabilities {
  aiSessions: AiSessionsCapability;
  agentsView: UiAgentsViewCapability;
  browserTabs: BrowserTabsCapability;
  commandPalette: UiCommandPaletteCapability;
  desktopWindow: DesktopWindowCapability;
  editorNavigation: EditorNavigationCapability;
  editorSessions: EditorSessionsCapability;
  presentation: WorkspacePresentationCapability;
  rigWorkflows: WorkspaceRigWorkflowsCapability;
  rigs: WorkspaceRigsCapability;
  settingsView: UiSettingsViewCapability;
  sidebarNavigation: UiSidebarNavigationCapability;
  tabActions: WorkspaceTabActionsCapability;
  tabs: WorkspaceTabsCapability;
  terminalSessions: TerminalSessionsCapability;
}

interface SnapshotCapability<T> {
  snapshot(): T;
  subscribe(listener: () => void): () => void;
}

function useCapabilitySnapshot<T>(capability: SnapshotCapability<T>): T {
  const subscribe = useCallback(
    (listener: () => void) => capability.subscribe(listener),
    [capability],
  );
  const snapshot = useCallback(() => capability.snapshot(), [capability]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function rendererPlatform(): UiHeaderRuntime["platform"] {
  if (typeof navigator === "undefined") return "unknown";
  const value = navigator.platform.toLowerCase();
  if (value.includes("mac") || value.includes("iphone") || value.includes("ipad"))
    return "macos";
  if (value.includes("win")) return "windows";
  if (value.includes("linux")) return "linux";
  return "unknown";
}

export function activateLocalAgent(
  aiSessions: Pick<AiSessionsCapability, "openPanel" | "focusInput">,
): void {
  aiSessions.openPanel();
  aiSessions.focusInput(null);
}

/** Compose the exact established header model from provider-owned state.
 * This lives with the complete header source so a copied header plugin owns
 * both its UI and its public-capability orchestration. */
export function useHeaderRuntime(
  capabilities: HeaderRuntimeCapabilities,
): UiHeaderRuntime {
  const presentation = useCapabilitySnapshot(capabilities.presentation);
  const ai = useCapabilitySnapshot(capabilities.aiSessions);
  const settings = useCapabilitySnapshot(capabilities.settingsView);
  const palette = useCapabilitySnapshot(capabilities.commandPalette);
  const rigsSnapshot = useCapabilitySnapshot(capabilities.rigs);
  const showPalette = useCallback(
    () => capabilities.commandPalette.show("commands"),
    [capabilities.commandPalette],
  );
  const closePalette = useCallback(
    () => capabilities.commandPalette.close(),
    [capabilities.commandPalette],
  );
  const setPaletteAnchor = useCallback(
    (element: HTMLElement | null) =>
      capabilities.commandPalette.setAnchor(element),
    [capabilities.commandPalette],
  );
  const setPaletteInputSlot = useCallback(
    (element: HTMLElement | null) =>
      capabilities.commandPalette.setInputSlot(element),
    [capabilities.commandPalette],
  );

  return useMemo(() => {
    const platform = rendererPlatform();
    const rigs: UiHeaderRig[] = rigsSnapshot.rigs.map((rig) => ({
      id: rig.id,
      name: rig.name,
      root: rig.root,
      workspaceKind: rig.workspace.kind,
      ...(rig.color !== undefined ? { color: rig.color } : {}),
    }));
    const agentSessions: UiHeaderAgentSession[] = [];
    const agentNotifications: UiHeaderAgentNotification[] = [];

    return {
      platform,
      customWindowControls: platform !== "macos" && platform !== "unknown",
      zenMode: presentation.context.zenMode,
      aiPanelOpen: ai.panelOpen || ai.miniOpen,
      agentsViewOpen: presentation.header.agentsViewOpen,
      settingsViewOpen: settings.open,
      editorDirty: presentation.header.editorDirty,
      activeTabId: presentation.header.activeTabId,
      activeRigId: rigsSnapshot.activeId,
      tabs: presentation.header.tabs,
      allTabs: presentation.header.allTabs,
      rigs,
      agentSessions,
      agentNotifications,
      findTarget: presentation.header.findTarget,
      palette: {
        open: palette.open,
        show: showPalette,
        close: closePalette,
        setAnchor: setPaletteAnchor,
        setInputSlot: setPaletteInputSlot,
      },
      selectTab(id) {
        const snapshot = capabilities.tabs.snapshot();
        if (snapshot.splitTabId !== 0 && id === snapshot.splitTabId) {
          capabilities.tabs.transition({ focusedPane: "right" });
        } else if (snapshot.splitTabId !== 0 && id === snapshot.activeId) {
          capabilities.tabs.transition({ focusedPane: "left" });
        } else if (
          snapshot.splitTabId !== 0 &&
          snapshot.focusedPane === "right"
        ) {
          capabilities.tabs.transition({ splitTabId: id });
        } else {
          capabilities.tabs.transition({ activeId: id, focusedPane: "left" });
        }
      },
      splitTab: (id) => capabilities.tabs.transition({ splitTabId: id }),
      newTab: () => void capabilities.terminalSessions.open(),
      newBlockTab: () =>
        void capabilities.terminalSessions.open({ blocks: true }),
      newPrivateTab: () =>
        void capabilities.terminalSessions.open({ private: true }),
      newPreviewTab: () => void capabilities.browserTabs.open(""),
      newEditor: () => capabilities.editorNavigation.openNewFile(),
      // The renderer replaces this with source-control.navigation.
      newGitGraph: () => {},
      closeTab: (id) => void capabilities.tabActions.close(id),
      closeMany: (id, mode) =>
        void capabilities.tabActions.closeMany(id, mode),
      newTabRightOf: (id) => void capabilities.tabActions.newRightOf(id),
      duplicateTab: (id) => void capabilities.tabActions.duplicate(id),
      pinTab: (id) => void capabilities.editorNavigation.pin(id),
      renameTab: (id, title) => capabilities.tabActions.rename(id, title),
      reorderTab: (id, gap) => void capabilities.tabs.reorderByGap(id, gap),
      overrideLanguage: (id, language) =>
        void capabilities.editorNavigation.setLanguage(id, language),
      toggleSidebar: () => capabilities.sidebarNavigation.toggle(),
      saveActiveFile: () => {
        void capabilities.editorSessions.save(
          capabilities.presentation.snapshot().header.activeTabId,
        );
      },
      toggleAiPanel: () => capabilities.aiSessions.togglePanel(),
      toggleAgentsView() {
        if (capabilities.agentsView.snapshot().open) {
          capabilities.agentsView.close();
        } else {
          capabilities.settingsView.close();
          capabilities.agentsView.show();
        }
      },
      toggleSettings() {
        if (capabilities.settingsView.snapshot().open) {
          capabilities.settingsView.close();
        } else {
          capabilities.settingsView.show();
        }
      },
      activateAgent(tabId, leafId) {
        const snapshot = capabilities.tabs.snapshot();
        const tab = snapshot.tabs.find((entry) => entry.id === tabId);
        if (!tab) return;
        if (tab.rigId !== capabilities.rigs.snapshot().activeId) {
          capabilities.rigs.activate(tab.rigId);
        }
        capabilities.tabs.transition({
          tabs: snapshot.tabs.map((entry) =>
            entry.id === tabId
              ? { ...entry, data: { ...entry.data, activeLeafId: leafId } }
              : entry,
          ),
          activeId: tabId,
        });
        capabilities.terminalSessions.focus(leafId);
      },
      activateLocalAgent() {
        activateLocalAgent(capabilities.aiSessions);
      },
      // AgentAwareHeader replaces these with agents.activity actions.
      markAgentNotificationsRead: () => {},
      clearAgentNotifications: () => {},
      activateRig(id) {
        capabilities.rigs.activate(id);
        capabilities.agentsView.close();
      },
      renameRig: (id, name) => capabilities.rigs.rename(id, name),
      deleteRig: (id) => capabilities.rigWorkflows.remove(id),
      reorderRigs: (ids) => capabilities.rigs.reorder(ids),
      newRig: () => void capabilities.rigWorkflows.createLocal(),
      newSshRig: (connectionId) =>
        void capabilities.rigWorkflows.createSsh(connectionId),
      newTabInRig(rigId) {
        const root = capabilities.rigs
          .snapshot()
          .rigs.find((rig) => rig.id === rigId)?.root;
        capabilities.terminalSessions.open({
          rigId,
          ...(root ? { cwd: root } : {}),
        });
      },
      jumpToTab(id) {
        const tab = capabilities.tabs
          .snapshot()
          .tabs.find((entry) => entry.id === id);
        if (!tab) return;
        capabilities.tabs.transition({ activeId: id });
        capabilities.rigs.activate(tab.rigId);
      },
      moveTabToRig(tabId, rigId) {
        if (capabilities.tabs.moveToRig(tabId, rigId).followTargetRig) {
          capabilities.rigs.activate(rigId);
        }
      },
      reorderRigTab(tabId, targetTabId, edge) {
        const target = capabilities.tabs
          .snapshot()
          .tabs.find((entry) => entry.id === targetTabId);
        if (
          capabilities.tabs.reorderAcrossRigs(tabId, targetTabId, edge)
            .followTargetRig &&
          target
        ) {
          capabilities.rigs.activate(target.rigId);
        }
      },
      minimizeWindow: () => void capabilities.desktopWindow.minimize(),
      toggleMaximizeWindow: () =>
        void capabilities.desktopWindow.toggleMaximize(),
      closeWindow: () => void capabilities.desktopWindow.close(),
      isWindowMaximized: () => capabilities.desktopWindow.isMaximized(),
    };
  }, [
    ai.miniOpen,
    ai.panelOpen,
    capabilities,
    closePalette,
    palette.open,
    presentation,
    rigsSnapshot,
    setPaletteAnchor,
    setPaletteInputSlot,
    settings.open,
    showPalette,
  ]);
}
