/**
 * Shared types for the SSH backend (connection manager + remote Termco Server).
 * connection ids are `~/.ssh/config` Host aliases or `user@host[:port]` strings.
 */

/** A resolved ssh destination the runner/connection layer acts on. */
export interface SshTarget {
  /** Stable id: a config Host alias or `user@host[:port]`. */
  connectionId: string;
  host: string;
  user?: string;
  port?: number;
}

/** A Host block parsed out of `~/.ssh/config`. */
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

/** Snapshot handed to the renderer for the env selector / status UI. */
export interface SshConnectionStatus {
  connectionId: string;
  state: SshConnectionState;
  detail?: string;
  error?: string;
}
