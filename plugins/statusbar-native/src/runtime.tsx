import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import type {
  WorkspaceEnvironmentCapability,
  WorkspacePresentationCapability,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface StatusbarRuntimeCapabilities {
  aiSessions: AiSessionsCapability;
  environment: WorkspaceEnvironmentCapability;
  presentation: WorkspacePresentationCapability;
  settingsView: UiSettingsViewCapability;
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

function rendererPlatform(): UiStatusbarRuntime["platform"] {
  if (typeof navigator === "undefined") return "unknown";
  const value = navigator.platform.toLowerCase();
  if (value.includes("mac") || value.includes("iphone") || value.includes("ipad"))
    return "macos";
  if (value.includes("win")) return "windows";
  if (value.includes("linux")) return "linux";
  return "unknown";
}

function focusedTab(snapshot: WorkspaceTabsSnapshot) {
  const focusedId =
    snapshot.focusedPane === "right" && snapshot.splitTabId !== 0
      ? snapshot.splitTabId
      : snapshot.activeId;
  return snapshot.tabs.find((tab) => tab.id === focusedId) ?? null;
}

function quoteShellArg(value: string, windows: boolean): string {
  return windows
    ? `'${value.replace(/'/g, "''")}'`
    : `'${value.replace(/'/g, "'\\''")}'`;
}

/** Compose the established status-bar model inside its source-owning plugin. */
export function useStatusbarRuntime(
  capabilities: StatusbarRuntimeCapabilities,
): UiStatusbarRuntime {
  const presentation = useCapabilitySnapshot(capabilities.presentation);
  const environment = useCapabilitySnapshot(capabilities.environment);
  const tabs = useCapabilitySnapshot(capabilities.tabs);
  const ai = useCapabilitySnapshot(capabilities.aiSessions);
  const activeTab = focusedTab(tabs);

  return useMemo(() => {
    const platform = rendererPlatform();
    const { cwd, filePath, home, privateActive, zenMode } =
      presentation.context;
    return {
      platform,
      zenMode,
      cwd,
      filePath,
      home,
      privateActive,
      workspace: environment.workspace,
      wslDistros: environment.wslDistros,
      wslLoading: environment.wslLoading,
      wslError: environment.wslError,
      lspServerId: null,
      ai: {
        status: ai.agent.status,
        step: ai.agent.step,
        error: ai.agent.error,
      },
      aiSurfaceOpen: ai.panelOpen || ai.miniOpen,
      sendCd(path: string) {
        if (activeTab?.kind !== "terminal") return;
        const activeLeafId = activeTab.data?.activeLeafId;
        if (typeof activeLeafId !== "number") return;
        if (
          !capabilities.terminalSessions.write(
            activeLeafId,
            `cd ${quoteShellArg(path, platform === "windows")}\r`,
          )
        ) {
          return;
        }
        capabilities.terminalSessions.focus(activeLeafId);
      },
      changeWorkspace: (workspace) =>
        void capabilities.environment.switch(workspace),
      refreshWslDistros: () => capabilities.environment.refreshWslDistros(),
      openLanguagesSettings: () => capabilities.settingsView.show("languages"),
      openAi: () => capabilities.aiSessions.openPanel(),
    };
  }, [activeTab, ai, capabilities, environment, presentation.context]);
}
