import type { WorkspaceEnv } from "@termco/workspace-base";

export interface PtyShellInfo {
  name: string;
  path: string;
  integrated: boolean;
}

export interface PtyAgentSignal {
  id: number;
  kind: "started" | "working" | "attention" | "finished" | "exited";
  agent: string | null;
}

export interface PtyOpenParams {
  cols: number;
  rows: number;
  cwd?: string | null;
  blocks?: boolean | null;
  shell?: string | null;
  workspace?: WorkspaceEnv | null;
}

export interface PtyOpenHandlers {
  onData(message: unknown): void;
  onExit(message: unknown): void;
}

/** One application-wide pool of native terminal processes. */
export interface PtyCapability {
  open(params: PtyOpenParams, handlers: PtyOpenHandlers): Promise<number>;
  write(id: number, bytes: Uint8Array): void;
  resize(id: number, cols: number, rows: number): void;
  close(id: number): void;
  closeAll(): number | Promise<number>;
  hasForegroundProcess(id: number): Promise<boolean>;
  hasForegroundJob(id: number): Promise<boolean>;
  shellName(): string | Promise<string>;
  listShells(): PtyShellInfo[] | Promise<PtyShellInfo[]>;
  liveSessions():
    | Array<{ id: string; label: string }>
    | Promise<Array<{ id: string; label: string }>>;
}
