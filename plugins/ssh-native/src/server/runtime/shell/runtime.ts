import type { WorkspaceCapability } from "@termco/workspace-base";

let workspace: WorkspaceCapability | null = null;
export function configureWorkspace(value: WorkspaceCapability): void {
  workspace = value;
}
export const registry = {
  authorize(path: string): string {
    if (!workspace) throw new Error("shell.execution is not configured");
    return workspace.authorizeRoot(path);
  },
};
