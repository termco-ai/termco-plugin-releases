import type { WorkspaceEnv } from "@termco/workspace-base";

export interface ShellExecutionCapability {
  run(command: string, cwd: string | undefined, timeoutSeconds: number | undefined, workspace: WorkspaceEnv): Promise<unknown>;
  sessionOpen(cwd: string | undefined, workspace: WorkspaceEnv): Promise<number>;
  sessionRun(id: number, command: string, cwd: string | undefined, timeoutSeconds: number | undefined, workspace: WorkspaceEnv): Promise<unknown>;
  sessionClose(id: number): Promise<void>;
  backgroundSpawn(command: string, cwd: string | undefined, workspace: WorkspaceEnv): Promise<number>;
  backgroundLogs(handle: number, sinceOffset?: number): Promise<unknown>;
  backgroundKill(handle: number): Promise<void>;
  backgroundList(): unknown[];
  liveResources(): Array<{ id: string; label: string }>;
}
