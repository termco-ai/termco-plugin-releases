import type { PreferencesCapability } from "@termco/storage-base";
import type {
  CreateWorkspaceRigInput,
  WorkspaceRig,
  WorkspaceRigsCapability,
  WorkspaceRigsSnapshot,
} from "@termco/workspace-base";

export const WORKSPACE_RIGS_KEY = "workspace.rigs.state";

function createId(): string {
  return `rig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validRig(value: unknown): value is WorkspaceRig {
  if (!value || typeof value !== "object") return false;
  const rig = value as Partial<WorkspaceRig>;
  return (
    typeof rig.id === "string" &&
    rig.id.length > 0 &&
    typeof rig.name === "string" &&
    (rig.root === null || typeof rig.root === "string")
  );
}

function normalize(snapshot: unknown): WorkspaceRigsSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    return emptySnapshot();
  }
  const candidate = snapshot as Partial<WorkspaceRigsSnapshot>;
  const rigs = Array.isArray(candidate.rigs)
    ? candidate.rigs.filter(validRig).map((rig) => ({
        ...rig,
        workspace: rig.workspace ?? { kind: "local" as const },
        createdAt: typeof rig.createdAt === "number" ? rig.createdAt : Date.now(),
        updatedAt: typeof rig.updatedAt === "number" ? rig.updatedAt : Date.now(),
      }))
    : [];
  if (rigs.length === 0 && !Array.isArray(candidate.rigs)) return emptySnapshot();
  const activeId = rigs.some((rig) => rig.id === candidate.activeId)
    ? candidate.activeId!
    : rigs[0]?.id ?? null;
  return {
    hydrated: true,
    rigs,
    activeId,
  };
}

function emptySnapshot(): WorkspaceRigsSnapshot {
  return {
    hydrated: true,
    rigs: [],
    activeId: null,
  };
}

export class WorkspaceRigsStore implements WorkspaceRigsCapability {
  #snapshot: WorkspaceRigsSnapshot = emptySnapshot();
  #listeners = new Set<() => void>();
  #persisting: Promise<void> = Promise.resolve();

  constructor(private readonly preferences: PreferencesCapability) {}

  async hydrate(): Promise<void> {
    this.#snapshot = normalize(
      await this.preferences.get<WorkspaceRigsSnapshot>(WORKSPACE_RIGS_KEY),
    );
    this.#publish(false);
  }

  snapshot(): WorkspaceRigsSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  create(input: CreateWorkspaceRigInput = {}): WorkspaceRig {
    const id = input.id?.trim() || createId();
    if (this.#snapshot.rigs.some((rig) => rig.id === id)) {
      throw new Error(`Rig already exists: ${id}`);
    }
    const now = Date.now();
    const rig: WorkspaceRig = {
      id,
      name: input.name?.trim() || `Rig ${this.#snapshot.rigs.length + 1}`,
      root: input.root ?? null,
      workspace: input.workspace ?? { kind: "local" },
      createdAt: now,
      updatedAt: now,
      ...(input.color ? { color: input.color } : {}),
    };
    this.#replace({
      rigs: [...this.#snapshot.rigs, rig],
      activeId: rig.id,
    });
    void this.#persist();
    return rig;
  }

  rename(id: string, name: string): void {
    const next = name.trim();
    if (!next) throw new Error("Rig name cannot be empty");
    this.#updateRig(id, (rig) => ({ ...rig, name: next, updatedAt: Date.now() }));
    void this.#persist();
  }

  setWorkspace(
    id: string,
    workspace: WorkspaceRig["workspace"],
    root?: string | null,
  ): void {
    this.#updateRig(id, (rig) => ({
      ...rig,
      workspace,
      updatedAt: Date.now(),
      ...(root !== undefined ? { root } : {}),
    }));
    void this.#persist();
  }

  setColor(id: string, color?: number): void {
    this.#updateRig(id, (rig) => ({ ...rig, color, updatedAt: Date.now() }));
    void this.#persist();
  }

  reorder(ids: readonly string[]): void {
    const byId = new Map(this.#snapshot.rigs.map((rig) => [rig.id, rig]));
    const rigs: WorkspaceRig[] = [];
    for (const id of ids) {
      const rig = byId.get(id);
      if (rig) rigs.push(rig);
    }
    for (const rig of this.#snapshot.rigs) {
      if (!rigs.includes(rig)) rigs.push(rig);
    }
    if (rigs.length !== this.#snapshot.rigs.length) return;
    this.#replace({ rigs });
    void this.#persist();
  }

  remove(id: string): void {
    this.#requireRig(id);
    const rigs = this.#snapshot.rigs.filter((rig) => rig.id !== id);
    this.#replace({
      rigs,
      activeId: this.#snapshot.activeId === id ? rigs[0]?.id ?? null : this.#snapshot.activeId,
    });
    void this.#persist();
  }

  activate(id: string): void {
    this.#requireRig(id);
    if (this.#snapshot.activeId === id) return;
    this.#replace({ activeId: id });
    void this.#persist();
  }

  cycle(direction: -1 | 1): void {
    if (this.#snapshot.rigs.length === 0) return;
    const index = this.#snapshot.rigs.findIndex(
      (rig) => rig.id === this.#snapshot.activeId,
    );
    const next =
      (index + direction + this.#snapshot.rigs.length) %
      this.#snapshot.rigs.length;
    this.activate(this.#snapshot.rigs[next].id);
  }

  #requireRig(id: string): WorkspaceRig {
    const rig = this.#snapshot.rigs.find((candidate) => candidate.id === id);
    if (!rig) throw new Error(`Unknown rig: ${id}`);
    return rig;
  }

  #updateRig(id: string, update: (rig: WorkspaceRig) => WorkspaceRig): void {
    this.#requireRig(id);
    this.#replace({
      rigs: this.#snapshot.rigs.map((rig) => (rig.id === id ? update(rig) : rig)),
    });
  }

  #replace(patch: Partial<WorkspaceRigsSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch, hydrated: true };
    this.#publish(false);
  }

  #publish(persist: boolean): void {
    for (const listener of this.#listeners) listener();
    if (persist) void this.#persist();
  }

  #persist(): Promise<void> {
    const snapshot = this.#snapshot;
    this.#persisting = this.#persisting.then(() =>
      this.preferences.set(WORKSPACE_RIGS_KEY, snapshot),
    );
    return this.#persisting;
  }
}
