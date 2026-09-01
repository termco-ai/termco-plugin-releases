import type { WorkspaceEnv } from "./workspace";

export type WorkspaceExecutionKind = "local" | "wsl" | "ssh" | "container";

export interface WorkspaceExecutionRequest {
  domain: string;
  method: string;
  args: readonly unknown[];
}

export type WorkspaceExecutionAvailability =
  | { available: true; backendId: string; label: string }
  | {
      available: false;
      code: "workspace-execution-unavailable";
      workspaceKind: WorkspaceExecutionKind;
      reason: string;
    };

export interface WorkspaceExecutionBackend {
  readonly id: string;
  readonly kind: WorkspaceExecutionKind;
  readonly label: string;
  readonly priority: number;
  status(workspace: WorkspaceEnv): { available: boolean; reason?: string };
  prepare?<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest): T;
  invoke<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest): Promise<T>;
  openChannel?(
    workspace: WorkspaceEnv,
    listener: (event: string, data: unknown) => void,
  ): Promise<WorkspaceExecutionChannel>;
}

export interface WorkspaceExecutionChannel {
  readonly id: number;
  call<T>(method: string, params?: unknown): Promise<T>;
  close(): void;
}

export interface WorkspaceExecutionBackendRegistry {
  register(backend: WorkspaceExecutionBackend): () => void;
  resolve(workspace: WorkspaceEnv): WorkspaceExecutionBackend | undefined;
  snapshot(): readonly WorkspaceExecutionBackend[];
  subscribe(listener: () => void): () => void;
}

export interface WorkspaceExecutionCapability {
  availability(workspace: WorkspaceEnv): WorkspaceExecutionAvailability;
  prepare<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest): T;
  invoke<T>(workspace: WorkspaceEnv, request: WorkspaceExecutionRequest): Promise<T>;
  openChannel(
    workspace: WorkspaceEnv,
    listener: (event: string, data: unknown) => void,
  ): Promise<WorkspaceExecutionChannel>;
}
