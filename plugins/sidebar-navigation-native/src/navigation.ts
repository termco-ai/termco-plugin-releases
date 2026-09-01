import type {
  UiSidebarNavigationCapability,
  UiSidebarNavigationSnapshot,
  UiSidebarPanelHandle,
} from "@termco/ui-sidebar-base";

export const SIDEBAR_DEFAULT_WIDTH = 308;
export const SIDEBAR_MIN_WIDTH = 268;
export const SIDEBAR_MAX_WIDTH = 528;
export const SIDEBAR_WIDTH_STORAGE_KEY = "termco.sidebar.width";
export const SIDEBAR_VIEW_STORAGE_KEY = "termco.sidebar.view";
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "termco.sidebar.collapsed";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Timers {
  set(callback: () => void, delay: number): number;
  clear(id: number): void;
}

export class SidebarNavigation implements UiSidebarNavigationCapability {
  readonly #listeners = new Set<() => void>();
  readonly #storage: StorageLike;
  readonly #timers: Timers;
  #panel: UiSidebarPanelHandle | null = null;
  #collapsed: boolean;
  #widthTimer = 0;
  #snapshot: UiSidebarNavigationSnapshot;

  constructor(storage: StorageLike, timers: Timers) {
    this.#storage = storage;
    this.#timers = timers;
    const initialCollapsed = this.#readCollapsed();
    this.#collapsed = initialCollapsed;
    this.#snapshot = {
      revision: 0,
      view: this.#readView(),
      initialCollapsed,
      width: this.#readWidth(),
    };
  }

  snapshot(): UiSidebarNavigationSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  bindPanel(panel: UiSidebarPanelHandle | null): void {
    this.#panel = panel;
  }

  select(view: string): void {
    this.#write(SIDEBAR_VIEW_STORAGE_KEY, view);
    if (view === this.#snapshot.view) return;
    this.#publish({ ...this.#snapshot, view });
  }

  show(view: string): void {
    const collapsed = this.#panel?.isCollapsed() ?? false;
    if (collapsed) {
      this.#panel?.resize(`${this.#snapshot.width}px`);
      if (view !== this.#snapshot.view) this.select(view);
      return;
    }
    if (view === this.#snapshot.view) {
      this.#panel?.collapse();
      return;
    }
    this.select(view);
  }

  toggle(): void {
    if (!this.#panel) return;
    if (this.#panel.isCollapsed()) {
      this.#panel.resize(`${this.#snapshot.width}px`);
    } else {
      this.#panel.collapse();
    }
  }

  setCollapsed(collapsed: boolean): void {
    if (this.#collapsed === collapsed) return;
    this.#collapsed = collapsed;
    this.#write(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      collapsed ? "1" : "0",
    );
  }

  setWidth(width: number): void {
    const clamped = clampWidth(width);
    if (clamped !== this.#snapshot.width) {
      this.#publish({ ...this.#snapshot, width: clamped });
    }
    if (this.#widthTimer) this.#timers.clear(this.#widthTimer);
    this.#widthTimer = this.#timers.set(() => {
      this.#widthTimer = 0;
      this.#write(SIDEBAR_WIDTH_STORAGE_KEY, String(this.#snapshot.width));
    }, 200);
  }

  dispose(): void {
    if (!this.#widthTimer) return;
    this.#timers.clear(this.#widthTimer);
    this.#widthTimer = 0;
    this.#write(SIDEBAR_WIDTH_STORAGE_KEY, String(this.#snapshot.width));
  }

  #publish(next: UiSidebarNavigationSnapshot): void {
    this.#snapshot = { ...next, revision: this.#snapshot.revision + 1 };
    for (const listener of this.#listeners) listener();
  }

  #readView(): string {
    try {
      return this.#storage.getItem(SIDEBAR_VIEW_STORAGE_KEY) || "explorer";
    } catch {
      return "explorer";
    }
  }

  #readCollapsed(): boolean {
    try {
      return this.#storage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  #readWidth(): number {
    try {
      const stored = this.#storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
      const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
      return Number.isFinite(parsed) ? clampWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  }

  #write(key: string, value: string): void {
    try {
      this.#storage.setItem(key, value);
    } catch {
      // Browser storage may be unavailable in private or locked-down contexts.
    }
  }
}

function clampWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}
