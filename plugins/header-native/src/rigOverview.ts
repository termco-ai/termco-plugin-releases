import type {
  WorkspaceRigOverviewCapability,
  WorkspaceRigOverviewSnapshot,
} from "@termco/workspace-base";

export class RigOverviewStore implements WorkspaceRigOverviewCapability {
  #snapshot: WorkspaceRigOverviewSnapshot = { revision: 0, open: false };
  #listeners = new Set<() => void>();

  snapshot(): WorkspaceRigOverviewSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setOpen(open: boolean): void {
    if (this.#snapshot.open === open) return;
    this.#snapshot = { revision: this.#snapshot.revision + 1, open };
    for (const listener of this.#listeners) listener();
  }
}
