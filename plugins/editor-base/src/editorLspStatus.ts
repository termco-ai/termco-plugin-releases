import type { WorkspaceEnv } from "@termco/workspace-base";

/** Read-only projection of the LSP state owned by the selected editor surface. */
export interface EditorLspStatusCapability {
  serverId(workspace: WorkspaceEnv, path: string | null): string | null;
  subscribe(listener: () => void): () => void;
}
