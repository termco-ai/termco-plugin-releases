import type { PreferencesCapability } from "@termco/storage-base";
import type {
  WorkspaceRigTabLayout,
  WorkspaceSavedTab,
  WorkspaceTabRecord,
  WorkspaceTabMoveResult,
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
  WorkspaceTabsTransition,
} from "@termco/workspace-base";

export const WORKSPACE_TAB_LAYOUTS_KEY = "workspace.tabs.layouts";

function cloneSavedTab(tab: WorkspaceSavedTab): WorkspaceSavedTab {
  return structuredClone(tab);
}

function cloneLayout(layout: WorkspaceRigTabLayout): WorkspaceRigTabLayout {
  return {
    rigId: layout.rigId,
    tabs: layout.tabs.map(cloneSavedTab),
    activeTabIndex: layout.activeTabIndex,
    splitTabIndex: layout.splitTabIndex,
  };
}

function validLayout(value: unknown): value is WorkspaceRigTabLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<WorkspaceRigTabLayout>;
  return (
    typeof layout.rigId === "string" &&
    layout.rigId.length > 0 &&
    Array.isArray(layout.tabs) &&
    layout.tabs.every(
      (tab) =>
        Boolean(tab) &&
        typeof tab === "object" &&
        typeof (tab as Partial<WorkspaceSavedTab>).kind === "string",
    ) &&
    Number.isSafeInteger(layout.activeTabIndex) &&
    Number.isSafeInteger(layout.splitTabIndex)
  );
}

function validateTabs(tabs: readonly WorkspaceTabRecord[]): void {
  const ids = new Set<number>();
  for (const tab of tabs) {
    if (!Number.isSafeInteger(tab.id) || tab.id <= 0) {
      throw new Error(`Invalid workspace tab id: ${tab.id}`);
    }
    if (ids.has(tab.id)) throw new Error(`Duplicate workspace tab id: ${tab.id}`);
    if (!tab.kind || !tab.rigId || !tab.title) {
      throw new Error(`Workspace tab ${tab.id} is missing required metadata`);
    }
    ids.add(tab.id);
  }
}

export class WorkspaceTabsStore implements WorkspaceTabsCapability {
  #listeners = new Set<() => void>();
  #nextId = 1;
  #layouts = new Map<string, WorkspaceRigTabLayout>();
  #persisting: Promise<void> = Promise.resolve();
  #preferences: PreferencesCapability | undefined;
  #hasHydrated = false;
  #dirtyWhileUnbound = false;
  #snapshot: WorkspaceTabsSnapshot = {
    revision: 0,
    initialized: false,
    tabs: [],
    activeId: 0,
    splitTabId: 0,
    focusedPane: "left",
    booted: false,
    activeRigIdForNewTabs: "default",
    activeTabByRig: {},
  };

  constructor(preferences?: PreferencesCapability) {
    this.#preferences = preferences;
  }

  async hydrate(): Promise<void> {
    if (!this.#preferences) return;
    const saved = await this.#preferences.get<unknown>(WORKSPACE_TAB_LAYOUTS_KEY);
    const layouts = Array.isArray(saved) ? saved.filter(validLayout) : [];
    this.#layouts = new Map(
      layouts.map((layout) => [layout.rigId, cloneLayout(layout)]),
    );
    this.#hasHydrated = true;
  }

  async bindPreferences(
    preferences: PreferencesCapability,
  ): Promise<() => void> {
    await this.#persisting;
    this.#preferences = preferences;
    if (this.#dirtyWhileUnbound) {
      await preferences.set(WORKSPACE_TAB_LAYOUTS_KEY, this.savedLayouts());
      this.#dirtyWhileUnbound = false;
      this.#hasHydrated = true;
    } else if (!this.#hasHydrated) {
      await this.hydrate();
    }
    let bound = true;
    return () => {
      if (!bound) return;
      bound = false;
      if (this.#preferences === preferences) this.#preferences = undefined;
    };
  }

  snapshot(): WorkspaceTabsSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  initialize(initial: WorkspaceTabsTransition): void {
    if (this.#snapshot.initialized) return;
    this.#commit(initial, true);
  }

  allocate(count = 1): readonly number[] {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error(`Invalid workspace tab id allocation count: ${count}`);
    }
    const ids = Array.from({ length: count }, () => this.#nextId++);
    return ids;
  }

  transition(next: WorkspaceTabsTransition): void {
    if (!this.#snapshot.initialized) {
      throw new Error("Workspace tabs must be initialized before transition");
    }
    this.#commit(next, true);
  }

  nextActiveInRig(closingId: number): number | null {
    const closing = this.#snapshot.tabs.find((tab) => tab.id === closingId);
    if (!closing) return null;
    const sameRig = this.#snapshot.tabs.filter(
      (tab) => tab.rigId === closing.rigId,
    );
    if (sameRig.length <= 1) return null;
    const index = sameRig.findIndex((tab) => tab.id === closingId);
    return (sameRig[index - 1] ?? sameRig[index + 1]).id;
  }

  selectByRigIndex(index: number, rigId: string): number | null {
    const selected = this.#snapshot.tabs.filter((tab) => tab.rigId === rigId)[
      index
    ];
    if (!selected) return null;
    this.#commit({ activeId: selected.id }, true);
    return selected.id;
  }

  close(tabId: number): boolean {
    const target = this.#snapshot.tabs.find((tab) => tab.id === tabId);
    if (!target) return false;
    const candidate = this.nextActiveInRig(tabId);
    const fallback =
      candidate === this.#snapshot.splitTabId ? null : candidate;
    const wasActive = this.#snapshot.activeId === tabId;
    this.#commit(
      {
        tabs: this.#snapshot.tabs.filter((tab) => tab.id !== tabId),
        ...(wasActive ? { activeId: fallback ?? 0 } : {}),
        ...(this.#snapshot.splitTabId === tabId ? { splitTabId: 0 } : {}),
      },
      true,
    );
    return true;
  }

  moveToRig(tabId: number, targetRigId: string): WorkspaceTabMoveResult {
    const current = this.#snapshot.tabs;
    const moved = current.find((tab) => tab.id === tabId);
    if (!moved || moved.rigId === targetRigId) {
      return { changed: false, followTargetRig: false };
    }
    const fallback = this.nextActiveInRig(tabId);
    const activeMoved = this.#snapshot.activeId === tabId;
    this.#commit(
      {
        tabs: current.map((tab) =>
          tab.id === tabId ? { ...tab, rigId: targetRigId } : tab,
        ),
        ...(tabId === this.#snapshot.splitTabId ? { splitTabId: 0 } : {}),
        ...(activeMoved && fallback !== null ? { activeId: fallback } : {}),
      },
      true,
    );
    return {
      changed: true,
      followTargetRig: activeMoved && fallback === null,
    };
  }

  reorderAcrossRigs(
    tabId: number,
    targetTabId: number,
    edge: "top" | "bottom",
  ): WorkspaceTabMoveResult {
    if (tabId === targetTabId) {
      return { changed: false, followTargetRig: false };
    }
    const current = this.#snapshot.tabs;
    const moved = current.find((tab) => tab.id === tabId);
    const target = current.find((tab) => tab.id === targetTabId);
    if (!moved || !target) {
      return { changed: false, followTargetRig: false };
    }
    const crossRig = moved.rigId !== target.rigId;
    const next = current.filter((tab) => tab.id !== tabId);
    let targetIndex = next.findIndex((tab) => tab.id === targetTabId);
    if (edge === "bottom") targetIndex += 1;
    next.splice(
      targetIndex,
      0,
      crossRig ? { ...moved, rigId: target.rigId } : moved,
    );
    const fallback = crossRig ? this.nextActiveInRig(tabId) : null;
    const activeMoved = this.#snapshot.activeId === tabId;
    this.#commit(
      {
        tabs: next,
        ...(crossRig && tabId === this.#snapshot.splitTabId
          ? { splitTabId: 0 }
          : {}),
        ...(crossRig && activeMoved && fallback !== null
          ? { activeId: fallback }
          : {}),
      },
      true,
    );
    return {
      changed: true,
      followTargetRig: crossRig && activeMoved && fallback === null,
    };
  }

  reorderByGap(tabId: number, targetGapIndex: number): boolean {
    const current = this.#snapshot.tabs;
    const moved = current.find((tab) => tab.id === tabId);
    if (!moved) return false;
    const sameRig = current.filter((tab) => tab.rigId === moved.rigId);
    const fromIndex = sameRig.findIndex((tab) => tab.id === tabId);
    let targetIndex =
      targetGapIndex > fromIndex ? targetGapIndex - 1 : targetGapIndex;
    targetIndex = Math.max(0, Math.min(targetIndex, sameRig.length - 1));
    if (targetIndex === fromIndex) return false;
    const anchor = sameRig[targetIndex];
    const next = current.filter((tab) => tab.id !== tabId);
    const anchorIndex = next.findIndex((tab) => tab.id === anchor.id);
    const insertIndex = targetIndex > fromIndex ? anchorIndex + 1 : anchorIndex;
    next.splice(insertIndex, 0, moved);
    this.#commit({ tabs: next }, true);
    return true;
  }

  savedLayouts(): readonly WorkspaceRigTabLayout[] {
    return [...this.#layouts.values()].map(cloneLayout);
  }

  saveLayout(layout: WorkspaceRigTabLayout): Promise<void> {
    if (!validLayout(layout)) {
      throw new Error("Invalid saved workspace tab layout");
    }
    this.#layouts.set(layout.rigId, cloneLayout(layout));
    return this.#persistLayouts();
  }

  deleteLayout(rigId: string): Promise<void> {
    this.#layouts.delete(rigId);
    return this.#persistLayouts();
  }

  #commit(next: WorkspaceTabsTransition, initialized: boolean): void {
    let tabs = next.tabs ? next.tabs.map((tab) => ({ ...tab })) : this.#snapshot.tabs;
    validateTabs(tabs);
    let activeId = next.activeId ?? this.#snapshot.activeId;
    let splitTabId = next.splitTabId ?? this.#snapshot.splitTabId;
    let focusedPane = next.focusedPane ?? this.#snapshot.focusedPane;
    const booted = next.booted ?? this.#snapshot.booted;

    if (activeId !== 0 && !tabs.some((tab) => tab.id === activeId)) activeId = 0;
    if (splitTabId !== 0 && !tabs.some((tab) => tab.id === splitTabId)) splitTabId = 0;
    if (splitTabId !== 0 && splitTabId === activeId) {
      throw new Error("A workspace tab cannot occupy both split panes");
    }
    if (focusedPane !== "left" && focusedPane !== "right") {
      throw new Error(`Invalid focused workspace pane: ${focusedPane}`);
    }
    if (splitTabId === 0) focusedPane = "left";
    if (booted && activeId !== 0) {
      tabs = tabs.map((tab) =>
        tab.id === activeId && tab.cold ? { ...tab, cold: false } : tab,
      );
    }

    const maxId = tabs.reduce((max, tab) => Math.max(max, tab.id), 0);
    this.#nextId = Math.max(this.#nextId, maxId + 1);
    const activeTabByRig: Record<string, number> = {};
    for (const [rigId, tabId] of Object.entries(
      this.#snapshot.activeTabByRig,
    )) {
      if (tabs.some((tab) => tab.id === tabId && tab.rigId === rigId)) {
        activeTabByRig[rigId] = tabId;
      }
    }
    const activeTab = tabs.find((tab) => tab.id === activeId);
    if (activeTab) activeTabByRig[activeTab.rigId] = activeTab.id;
    this.#snapshot = {
      revision: this.#snapshot.revision + 1,
      initialized,
      tabs,
      activeId,
      splitTabId,
      focusedPane,
      booted,
      activeRigIdForNewTabs:
        next.activeRigIdForNewTabs ?? this.#snapshot.activeRigIdForNewTabs,
      activeTabByRig,
    };
    for (const listener of this.#listeners) listener();
  }

  #persistLayouts(): Promise<void> {
    const layouts = this.savedLayouts();
    const preferences = this.#preferences;
    if (!preferences) {
      this.#dirtyWhileUnbound = true;
      return Promise.resolve();
    }
    this.#persisting = this.#persisting.then(() =>
      preferences.set(WORKSPACE_TAB_LAYOUTS_KEY, layouts),
    );
    return this.#persisting;
  }
}
