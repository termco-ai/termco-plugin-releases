import type { WorkspaceEnv } from "@termco/workspace-base";

/** Shared shell-history suggestions and command discovery for every terminal surface. */
export interface ShellHistoryCapability {
  suggest(line: string, workspace: WorkspaceEnv): Promise<string | null>;
  commands(prefix: string, limit: number | undefined, workspace: WorkspaceEnv): Promise<string[]>;
  list(query: string, limit: number | undefined, workspace: WorkspaceEnv): Promise<string[]>;
  record(command: string, workspace: WorkspaceEnv): Promise<void>;
}
