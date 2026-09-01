import type { ContributionOwner, ContributionRecord, Dispose } from "@termco/kernel";
import type { ComponentType } from "react";

export const UI_HEADER_SEARCH_SERVICE = "ui.header-search";
export const UI_HEADER_ITEMS_SERVICE = "ui.header.items";

export type UiHeaderRegion =
  | "root"
  | "leading"
  | "workspaces"
  | "center"
  | "trailing"
  | "tabs";

export type UiHeaderBulkCloseMode = "others" | "right" | "left" | "all";

export interface UiHeaderTab {
  id: number;
  rigId: string;
  kind: string;
  label: string;
  title: string;
  dirty: boolean;
  preview: boolean;
  private: boolean;
  /** File-backed tabs expose their path so the source-owned header can retain
   * the baseline file icon, language menu, and Copy Path workflow. */
  path?: string;
  /** Terminal working directory shown by the workspace overview. */
  cwd?: string;
  /** User-selected editor language, used only for tab presentation. */
  overrideLanguage?: string | null;
}

export interface UiHeaderRig {
  id: string;
  name: string;
  root: string | null;
  workspaceKind: "local" | "wsl" | "ssh";
  color?: number;
}

export interface UiHeaderAgentSession {
  source: "terminal" | "local";
  leafId: number;
  tabId: number;
  agent: string;
  status: "working" | "waiting";
  location: string | null;
}

export interface UiHeaderAgentNotification {
  id: string;
  source: "terminal" | "local";
  leafId: number;
  tabId: number;
  agent: string;
  kind: "attention" | "finished" | "error";
  at: number;
  read: boolean;
  location: string | null;
}

export interface UiHeaderFindOptions {
  incremental?: boolean;
  matchBackground?: string;
  activeMatchBackground?: string;
  matchOverviewRuler?: string;
  activeMatchColorOverviewRuler?: string;
}

/** Adapter over the active surface's own search handle. The header plugin owns
 * the query workflow; the surface keeps ownership of its editor/terminal ref. */
export interface UiHeaderFindTarget {
  kind: "terminal" | "editor" | "git-history";
  findNext(query: string, options?: UiHeaderFindOptions): void;
  findPrevious(query: string, options?: UiHeaderFindOptions): void;
  clear(): void;
  focus(): void;
}

export interface UiHeaderPalettePort {
  open: boolean;
  show(): void;
  close(): void;
  setAnchor(element: HTMLElement | null): void;
  setInputSlot(element: HTMLElement | null): void;
}

/** Public read model and actions supplied to header contributions. The shell
 * owns no product controls; copied plugins decide what to render and invoke. */
export interface UiHeaderRuntime {
  platform: "macos" | "windows" | "linux" | "unknown";
  customWindowControls: boolean;
  zenMode: boolean;
  aiPanelOpen: boolean;
  agentsViewOpen: boolean;
  settingsViewOpen: boolean;
  editorDirty: boolean;
  activeTabId: number;
  activeRigId: string | null;
  tabs: readonly UiHeaderTab[];
  allTabs: readonly UiHeaderTab[];
  rigs: readonly UiHeaderRig[];
  agentSessions: readonly UiHeaderAgentSession[];
  agentNotifications: readonly UiHeaderAgentNotification[];
  findTarget: UiHeaderFindTarget | null;
  palette: UiHeaderPalettePort;
  selectTab(id: number): void;
  splitTab(id: number): void;
  newTab(): void;
  newBlockTab(): void;
  newPrivateTab(): void;
  newPreviewTab(): void;
  newEditor(): void;
  newGitGraph(): void;
  closeTab(id: number): void;
  closeMany(anchorId: number, mode: UiHeaderBulkCloseMode): void;
  newTabRightOf(anchorId: number): void;
  duplicateTab(id: number): void;
  pinTab(id: number): void;
  renameTab(id: number, title: string): void;
  reorderTab(fromId: number, toGapIndex: number): void;
  overrideLanguage(id: number, language: string | null): void;
  toggleSidebar(): void;
  saveActiveFile(): void;
  toggleAiPanel(): void;
  toggleAgentsView(): void;
  toggleSettings(): void;
  activateAgent(tabId: number, leafId: number): void;
  activateLocalAgent(): void;
  markAgentNotificationsRead(): void;
  clearAgentNotifications(): void;
  activateRig(id: string): void;
  renameRig(id: string, name: string): void;
  deleteRig(id: string): void;
  reorderRigs(ids: string[]): void;
  newRig(): void;
  newSshRig(connectionId: string): void;
  newTabInRig(rigId: string): void;
  jumpToTab(id: number): void;
  moveTabToRig(tabId: number, rigId: string): void;
  reorderRigTab(
    tabId: number,
    targetTabId: number,
    edge: "top" | "bottom",
  ): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  isWindowMaximized(): Promise<boolean>;
}

export interface UiHeaderItemContribution {
  id: string;
  label: string;
  description: string;
  region: UiHeaderRegion;
  order?: number;
  /** The contribution resolves its own declared capabilities. This keeps a
   * copied header plugin complete instead of depending on a host-built
   * product runtime. */
  Component: ComponentType;
}

export interface UiHeaderItemRegistry {
  register(
    entry: UiHeaderItemContribution,
    owner: ContributionOwner,
  ): Dispose;
  snapshot(): readonly UiHeaderItemContribution[];
  records(): readonly ContributionRecord<UiHeaderItemContribution>[];
  subscribe(listener: () => void): Dispose;
}

/** Imperative focus port owned by the selected header plugin. Consumers do
 * not receive the header input ref or any header-private component state. */
export interface UiHeaderSearchCapability {
  focus(): void;
  register(focus: () => void): () => void;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_HEADER_SEARCH_SERVICE]: UiHeaderSearchCapability;
    [UI_HEADER_ITEMS_SERVICE]: UiHeaderItemRegistry;
  }
}
