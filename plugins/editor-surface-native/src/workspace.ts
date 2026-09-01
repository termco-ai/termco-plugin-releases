import type { WorkspaceEnv } from "@termco/workspace-base";
import { currentWorkspace } from "./runtime";

export type { WorkspaceEnv } from "@termco/workspace-base";
export const LOCAL_WORKSPACE = { kind: "local" } as const;
export function currentWorkspaceEnv(): WorkspaceEnv {
  return currentWorkspace();
}
export function workspaceScopeKey(workspace: WorkspaceEnv): string {
  if (!workspace || workspace.kind === "local") return "local";
  if (workspace.kind === "wsl") return `wsl:${workspace.distro}`;
  return `ssh:${workspace.connectionId}`;
}
