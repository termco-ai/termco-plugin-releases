import type {
  DesktopIntegrationCapability,
  DesktopWindowCapability,
} from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { GitCapability } from "@termco/git-base";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { PtyCapability, ShellHistoryCapability } from "@termco/terminal-base";
import type { UiTabsRuntime } from "@termco/ui-tabs-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import type { WorkspaceCapability, WorkspaceEnv } from "@termco/workspace-base";

export type { WorkspaceEnv } from "@termco/workspace-base";

export type TerminalRuntime = {
  pty: PtyCapability;
  history: ShellHistoryCapability;
  files: WorkspaceFilesCapability;
  workspace: WorkspaceCapability;
  preferences: PreferencesCapability;
  shortcuts: ShortcutRegistryCapability;
  theme: UiThemeCapability;
  events: ApplicationEventsCapability;
  desktop: DesktopIntegrationCapability;
  desktopWindow: DesktopWindowCapability;
  git: GitCapability | null;
};

let selected: TerminalRuntime | null = null;
let activeTabs: UiTabsRuntime | null = null;
let gitAvailabilityRevision = 0;
const gitAvailabilityListeners = new Set<() => void>();

export function notifyTerminalGitChanged(): void {
  gitAvailabilityRevision += 1;
  for (const listener of gitAvailabilityListeners) listener();
}

export function subscribeTerminalGit(listener: () => void): () => void {
  gitAvailabilityListeners.add(listener);
  return () => gitAvailabilityListeners.delete(listener);
}

export function terminalGitSnapshot(): number {
  return gitAvailabilityRevision;
}

export function configureTerminalRuntime(runtime: TerminalRuntime): () => void {
  selected = runtime;
  return () => {
    if (selected === runtime) selected = null;
  };
}

export function terminalRuntime(): TerminalRuntime {
  if (!selected) throw new Error("terminal surface runtime is not active");
  return selected;
}

export function setActiveTabsRuntime(runtime: UiTabsRuntime | null): void {
  activeTabs = runtime;
}

export function tabsRuntime(): UiTabsRuntime | null {
  return activeTabs;
}

export function currentWorkspaceEnv(): WorkspaceEnv {
  return activeTabs?.workspace;
}
