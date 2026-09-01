import type { WorkspaceEnv } from "./workspace";

export interface WorkspaceRig {
  id: string;
  name: string;
  root: string | null;
  workspace: NonNullable<WorkspaceEnv>;
  color?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceRigsSnapshot {
  hydrated: boolean;
  rigs: readonly WorkspaceRig[];
  activeId: string | null;
}

export interface CreateWorkspaceRigInput {
  id?: string;
  name?: string;
  root?: string | null;
  workspace?: NonNullable<WorkspaceEnv>;
  color?: number;
}

/** Shared application rig state. The selected provider owns persistence and
 * ordering; UI and workflow plugins consume this contract instead of sharing
 * a private store. */
export interface WorkspaceRigsCapability {
  snapshot(): WorkspaceRigsSnapshot;
  subscribe(listener: () => void): () => void;
  create(input?: CreateWorkspaceRigInput): WorkspaceRig;
  rename(id: string, name: string): void;
  setWorkspace(
    id: string,
    workspace: NonNullable<WorkspaceEnv>,
    root?: string | null,
  ): void;
  setColor(id: string, color?: number): void;
  reorder(ids: readonly string[]): void;
  remove(id: string): void;
  activate(id: string): void;
  cycle(direction: -1 | 1): void;
}
