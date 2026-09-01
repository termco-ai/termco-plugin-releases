import type { UiHeaderFindTarget } from "@termco/ui-header-base";
import type { UiSurfaceSearchCapability } from "@termco/ui-tabs-base";

type Entry = {
  token: symbol;
  target: UiHeaderFindTarget;
};

export class SurfaceSearchRegistry implements UiSurfaceSearchCapability {
  readonly #entries = new Map<number, Entry>();
  readonly #listeners = new Set<() => void>();

  register(tabId: number, target: UiHeaderFindTarget): () => void {
    const token = Symbol(`surface-search:${tabId}`);
    this.#entries.set(tabId, { token, target });
    this.#publish();
    return () => {
      if (this.#entries.get(tabId)?.token !== token) return;
      this.#entries.delete(tabId);
      this.#publish();
    };
  }

  target(tabId: number): UiHeaderFindTarget | null {
    return this.#entries.get(tabId)?.target ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#entries.clear();
    this.#listeners.clear();
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }
}
