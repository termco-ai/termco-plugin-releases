import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { WorkspaceEnv } from "@termco/workspace-base";
import type { ComponentType } from "react";

export const UI_SIDEBAR_VIEWS_SERVICE = "ui.sidebar.views";
export const UI_SIDEBAR_NAVIGATION_SERVICE = "ui.sidebar-navigation";

export interface UiSidebarViewProps {
  rootPath: string | null;
  workspace: WorkspaceEnv;
  activeFilePath: string | null;
  openFileAt(path: string, line: number): void;
  openFile(path: string, pin?: boolean): void;
  navigateToPath(path: string): void;
  pathRenamed(from: string, to: string): void;
  pathDeleted(path: string): void;
  attachFileToAgent(path: string): void;
  /** Open a shared terminal tab, wait for its PTY session, then write a command. */
  runInNewTerminal(command: string, cwd?: string): Promise<void>;
}

export interface UiSidebarBadgeProps {
  rootPath: string | null;
  workspace: WorkspaceEnv;
}

export interface UiGitDiffRequest {
  path: string;
  repoRoot: string;
  mode: "+" | "-";
  originalPath: string | null;
  title?: string;
}

/** Complete sidebar feature. The contribution owns its icon, rendering, and
 * workflow; the shell supplies only current workspace context and navigation. */
export interface UiSidebarViewContribution {
  id: string;
  label: string;
  description: string;
  order?: number;
  /** Renderer-specific icon value. Default plugins use Hugeicons data. */
  icon: unknown;
  /** Optional reactive count shown on the rail. This is a hook so a plugin can
   * own polling/subscriptions without exposing its state to the shell. */
  useBadge?: (props: UiSidebarBadgeProps) => number;
  controller?: UiSidebarViewController;
  Component: ComponentType<UiSidebarViewProps>;
}

export interface UiSidebarViewRegistry {
  register(
    entry: UiSidebarViewContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiSidebarViewContribution[];
  records(): readonly ContributionRecord<UiSidebarViewContribution>[];
  subscribe(listener: () => void): Dispose;
}

export interface UiSidebarViewController {
  focus(): void;
  isFocused(): boolean;
  focusSearch(): void;
  revealPath(path: string): void;
}

export interface UiSidebarPanelHandle {
  isCollapsed(): boolean;
  resize(size: string): void;
  collapse(): void;
}

export interface UiSidebarNavigationSnapshot {
  readonly revision: number;
  readonly view: string;
  readonly initialCollapsed: boolean;
  readonly width: number;
}

/** Application-wide sidebar navigation and persistence. UI shells bind their
 * panel handle; headers, commands, and sidebar contributions invoke the same
 * selected provider instead of host callbacks. */
export interface UiSidebarNavigationCapability {
  snapshot(): UiSidebarNavigationSnapshot;
  subscribe(listener: () => void): () => void;
  bindPanel(panel: UiSidebarPanelHandle | null): void;
  select(view: string): void;
  show(view: string): void;
  toggle(): void;
  setCollapsed(collapsed: boolean): void;
  setWidth(width: number): void;
  dispose(): void;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_SIDEBAR_VIEWS_SERVICE]: UiSidebarViewRegistry;
    [UI_SIDEBAR_NAVIGATION_SERVICE]: UiSidebarNavigationCapability;
  }
}
