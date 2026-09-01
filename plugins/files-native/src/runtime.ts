import type { WorkspaceCapability, WorkspaceEnv } from "@termco/workspace-base";

let workspace: WorkspaceCapability | null = null;

export function workspaceRuntimeActive(): boolean {
  return workspace !== null;
}

export function configureWorkspace(value: WorkspaceCapability): () => void {
  workspace = value;
  return () => {
    if (workspace === value) workspace = null;
  };
}

function selected(): WorkspaceCapability {
  if (!workspace) throw new Error("workspace.files is not configured");
  return workspace;
}

export const resolvePath = (path: string, environment: WorkspaceEnv): string =>
  selected().resolvePath(path, environment);
export const toCanon = (path: string): string =>
  selected().toCanonicalDisplay(path);
export const registry = {
  authorize: (path: string): string => selected().authorizeRoot(path),
};
