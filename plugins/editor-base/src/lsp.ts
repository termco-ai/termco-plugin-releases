import type { WorkspaceEnv } from "@termco/workspace-base";

export interface LspCapabilityCaller {
  senderWebContentsId: number;
  progress?: (event: unknown) => void;
}

export interface LspServerConfig {
  id: string;
  name: string;
  languages: string[];
  command: string;
  args: string[];
  rootMarkers: string[];
  projectMarkers?: string[];
  role?: "primary" | "secondary";
  initializationOptions?: unknown;
  settings?: unknown;
  autoInstall?: { npmPackage: string; version: string; bin?: string };
  enabled: boolean;
  custom?: boolean;
}

export interface LspServerListEntry {
  config: LspServerConfig;
  status: "running" | "installed" | "found" | "missing";
  detail?: string;
}

export interface LspSessionStatus {
  sessionKey: string;
  serverId: string;
  scopeKey: string;
  root: string;
  state: "starting" | "running" | "restarting" | "error" | "stopped";
  openDocs: number;
  pid?: number;
  lastError?: string;
}

export interface LspDiagnosticEntry {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}

export interface LspDiagnosticSlice {
  serverId: string;
  diagnostics: LspDiagnosticEntry[];
}

/** One application-wide language-server session fleet. */
export interface LspSessionsCapability {
  listServers(): Promise<LspServerListEntry[]>;
  sessionStatus(): Promise<LspSessionStatus[]>;
  diagnosticsForOpenDocument(
    workspace: WorkspaceEnv,
    path: string,
  ): Promise<LspDiagnosticSlice[]>;
  setServerEnabled(id: string, enabled: boolean): Promise<void>;
  upsertServer(server: LspServerConfig): Promise<void>;
  removeServer(id: string): Promise<void>;
  installServer(serverId: string): Promise<{ ok: boolean; error?: string }>;
  restartSession(sessionKey: string): Promise<void>;
  invoke(
    command: string,
    payload: Record<string, unknown>,
    caller: LspCapabilityCaller,
  ): Promise<unknown>;
  liveResources(): Array<{ id: string; label: string }>;
}
