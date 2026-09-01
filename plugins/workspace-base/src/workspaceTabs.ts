export interface WorkspaceTabRecord {
  id: number;
  rigId: string;
  kind: string;
  title: string;
  cold?: boolean;
  data?: Readonly<Record<string, unknown>>;
}

export interface WorkspaceTabsSnapshot {
  revision: number;
  initialized: boolean;
  tabs: readonly WorkspaceTabRecord[];
  activeId: number;
  splitTabId: number;
  focusedPane: "left" | "right";
  booted: boolean;
  activeRigIdForNewTabs: string;
  /** Last selected tab that still belongs to each rig. The provider owns this
   * routing state so chat, automation, and tab surfaces share one truth. */
  activeTabByRig: Readonly<Record<string, number>>;
}

export interface WorkspaceTabsTransition {
  tabs?: readonly WorkspaceTabRecord[];
  activeId?: number;
  splitTabId?: number;
  focusedPane?: "left" | "right";
  booted?: boolean;
  activeRigIdForNewTabs?: string;
}

export interface WorkspaceTabMoveResult {
  changed: boolean;
  /** The moved active tab emptied its source rig, so UI should follow it. */
  followTargetRig: boolean;
}

/** JSON-safe saved form of a tab. The workspace-tabs provider owns storage;
 * the tab-kind implementation owns the meaning of every field after `kind`. */
export interface WorkspaceSavedTab {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export interface WorkspaceRigTabLayout {
  readonly rigId: string;
  readonly tabs: readonly WorkspaceSavedTab[];
  readonly activeTabIndex: number;
  readonly splitTabIndex: number;
}

/** Application-wide workspace tab state. Tab-kind plugins own their opaque
 * payloads; the selected provider owns identity, active/split selection,
 * initialization, split-pane focus, cold activation, validation, and
 * publication. */
export interface WorkspaceTabsCapability {
  snapshot(): WorkspaceTabsSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(initial: WorkspaceTabsTransition): void;
  allocate(count?: number): readonly number[];
  transition(next: WorkspaceTabsTransition): void;
  nextActiveInRig(closingId: number): number | null;
  selectByRigIndex(index: number, rigId: string): number | null;
  close(tabId: number): boolean;
  moveToRig(tabId: number, targetRigId: string): WorkspaceTabMoveResult;
  reorderAcrossRigs(
    tabId: number,
    targetTabId: number,
    edge: "top" | "bottom",
  ): WorkspaceTabMoveResult;
  reorderByGap(tabId: number, targetGapIndex: number): boolean;
  savedLayouts(): readonly WorkspaceRigTabLayout[];
  saveLayout(layout: WorkspaceRigTabLayout): Promise<void>;
  deleteLayout(rigId: string): Promise<void>;
}
