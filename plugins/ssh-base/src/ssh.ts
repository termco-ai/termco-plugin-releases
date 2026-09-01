export interface SshTarget {
  connectionId: string;
  host: string;
  user?: string;
  port?: number;
}

export interface SshShellIntegration {
  shellName: "zsh" | "bash" | "fish" | "other";
  integrationArg: string | null;
}

export interface SshHost {
  alias: string;
  hostName?: string;
  user?: string;
  port?: number;
}

export type SshConnectionState =
  | "idle"
  | "connecting"
  | "installing"
  | "ready"
  | "error"
  | "closed";

export interface SshConnectionStatus {
  connectionId: string;
  state: SshConnectionState;
  detail?: string;
  error?: string;
}

export interface SshRpcClient {
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  openChannel(handler: (event: string, data: unknown) => void): number;
  closeChannel(channel: number): void;
}

export interface SshConnection {
  connectionId: string;
  client: SshRpcClient;
  target: SshTarget;
}

export interface SshCliOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  spawnError: boolean;
}

export type SshForwardState =
  | "starting"
  | "active"
  | "reconnecting"
  | "error"
  | "stopped";

export interface SshForwardInfo {
  id: string;
  connectionId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  state: SshForwardState;
  error: string | null;
  desired: "running" | "stopped";
}

export interface SshForwardInput {
  localPort: number | "auto";
  remotePort: number;
  remoteHost?: string;
}

export interface SshDetectedPort {
  port: number;
  addresses: string[];
  loopbackOnly: boolean;
  process: string | null;
  container: { container: string; containerPort: number } | null;
}

export interface SshPortScanResult {
  ports: SshDetectedPort[];
  outdated: boolean;
}

export interface SshHubDomainState {
  data: unknown;
  collectedAt: number;
  receivedAt: number;
  stale: boolean;
  error: string | null;
}

export interface SshHubConnectionState {
  connectionId: string;
  supported: boolean;
  domains: Record<string, SshHubDomainState>;
}

export type SshWorkspace = {
  kind: "ssh";
  connectionId: string;
  host: string;
  user?: string;
  port?: number;
};

type RemoteMethod = (...args: never[]) => unknown;

/**
 * One application-wide SSH runtime. Higher-level providers share its
 * connection pool and RPC channels instead of spawning their own servers.
 */
export interface SshClientCapability {
  resolveTarget(payload: Record<string, unknown>): SshTarget;
  listHosts(): SshHost[];
  resolveHome(target: SshTarget): Promise<string>;
  connect(target: SshTarget): Promise<SshConnectionStatus>;
  /** RPC-safe convenience for consumers that persist the canonical connection id. */
  connectId(connectionId: string): Promise<SshConnectionStatus>;
  status(connectionId: string): SshConnectionStatus;
  disconnect(connectionId: string): Promise<void>;
  getConnection(target: SshTarget): Promise<SshConnection>;
  call<T = unknown>(workspace: SshWorkspace, method: string, params?: unknown): Promise<T>;
  ensureShellIntegration(target: SshTarget): Promise<SshShellIntegration>;
  destination(target: SshTarget): string;
  sshArgs(target: SshTarget, remote: string[], extraOptions?: string[]): string[];
  runSsh(target: SshTarget, command: string, timeoutSeconds?: number): Promise<SshCliOutput>;
  ok(output: SshCliOutput): boolean;
  readonly remotePathPrelude: string;
  readonly base64: {
    encode(bytes: Uint8Array): string;
    decode(text: string): Buffer;
  };
  isWorkspace(value: unknown): value is SshWorkspace;
  fs: Record<string, RemoteMethod>;
  containers: Record<string, RemoteMethod>;
  net: Record<string, RemoteMethod>;
  shell: Record<string, RemoteMethod>;
  gitRun(
    workspace: SshWorkspace,
    cwd: string | undefined,
    args: string[],
  ): Promise<{
    stdout: Buffer;
    stderr: Buffer;
    exitCode: number | null;
    truncated: boolean;
  }>;
  watchAdd(workspace: SshWorkspace, paths: string[]): Promise<void>;
  watchRemove(workspace: SshWorkspace, paths: string[]): Promise<void>;
  /** Flat methods are intentionally RPC-safe: renderer consumer plugins can
   * call them through the capability transport without importing host code. */
  forwardAdd(connectionId: string, input: SshForwardInput): Promise<SshForwardInfo>;
  forwardStart(id: string): Promise<SshForwardInfo>;
  forwardStop(id: string): Promise<SshForwardInfo>;
  forwardRemove(id: string): Promise<void>;
  forwardList(connectionId?: string): Promise<SshForwardInfo[]>;
  forwardEnsure(connectionId: string): Promise<SshForwardInfo[]>;
  forwards: {
    add(connectionId: string, input: unknown): unknown;
    start(id: string): unknown;
    stop(id: string): unknown;
    remove(id: string): Promise<void>;
    list(connectionId?: string): Promise<unknown[]>;
    ensure(connectionId: string): unknown;
  };
  state(connectionId: string): Promise<SshHubConnectionState>;
  scanPorts(workspace: SshWorkspace): Promise<SshPortScanResult>;
  liveResources(): Array<{ id: string; label: string }>;
}
