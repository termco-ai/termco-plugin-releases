/**
 * Per-connection lifecycle. One long-lived ssh process per connectionId carries
 * the Termco Server's stdio; all fs/git/search/watch RPCs multiplex over it.
 * Lazy + cached (a concurrent second request awaits the same connect); a dead
 * process evicts the cache so the next call reconnects.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { ensureServer } from "./deploy";
import { RpcClient } from "./rpc";
import { assertSafeTarget, sshArgs } from "./runner";
import type { SshConnectionState, SshConnectionStatus, SshTarget } from "./types";

export interface SshConnection {
  connectionId: string;
  client: RpcClient;
  child: ChildProcessWithoutNullStreams;
  target: SshTarget;
}

interface Entry {
  promise: Promise<SshConnection>;
  status: SshConnectionStatus;
  retryAfter?: number;
}

const entries = new Map<string, Entry>();
export const CONNECT_FAILURE_BACKOFF_MS = 5_000;

// Observers notified whenever a connection reaches "ready" — including
// RE-connections after a drop. Channel subscriptions (state hub) die with
// their connection, so this is the re-subscribe signal.
const readyObservers = new Set<(conn: SshConnection) => void>();

export function sshReadyObserverCount(): number {
  return readyObservers.size;
}

export function onConnectionReady(cb: (conn: SshConnection) => void): () => void {
  readyObservers.add(cb);
  return () => readyObservers.delete(cb);
}

const PERSIST_OPTS = ["-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=3"];

function setState(id: string, state: SshConnectionState, extra?: { detail?: string; error?: string }): void {
  const entry = entries.get(id);
  if (entry) entry.status = { connectionId: id, state, ...extra };
}

async function connect(target: SshTarget): Promise<SshConnection> {
  assertSafeTarget(target);
  setState(target.connectionId, "installing");
  const { nodePath, serverPath } = await ensureServer(target);

  setState(target.connectionId, "connecting");
  const args = sshArgs(target, [`${nodePath} ${serverPath} --stdio`], PERSIST_OPTS);
  const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });

  const client = new RpcClient((frame) => {
    if (child.stdin.writable) child.stdin.write(frame);
  });
  child.stdout.on("data", (c: Buffer) => client.feed(c));
  child.stderr.on("data", (c: Buffer) => {
    if (process.env.TERMCO_SSH_DEBUG) console.error(`[ssh:${target.connectionId}]`, c.toString());
  });

  let failed = false;
  const fail = (err: Error) => {
    if (failed) return;
    failed = true;
    setState(target.connectionId, "closed", { error: err.message });
    client.rejectAll(err);
    entries.delete(target.connectionId);
  };
  child.on("error", (e) => fail(e));
  child.on("exit", (code, signal) =>
    fail(new Error(`ssh exited (code=${code ?? "null"} signal=${signal ?? "null"})`)),
  );

  const conn: SshConnection = { connectionId: target.connectionId, client, child, target };
  await client.call("sys.ping"); // handshake proves the server booted
  setState(target.connectionId, "ready");
  for (const cb of readyObservers) {
    try {
      cb(conn);
    } catch (err) {
      console.error("[ssh] ready observer failed:", err);
    }
  }
  return conn;
}

/** Get (or lazily open) the connection for a target. */
export function getConnection(target: SshTarget): Promise<SshConnection> {
  const existing = entries.get(target.connectionId);
  if (existing) {
    if (
      existing.retryAfter !== undefined &&
      existing.retryAfter <= Date.now()
    ) {
      entries.delete(target.connectionId);
    } else {
      return existing.promise;
    }
  }
  const status: SshConnectionStatus = { connectionId: target.connectionId, state: "connecting" };
  const entry: Entry = {
    promise: Promise.resolve(null as unknown as SshConnection),
    status,
  };
  entries.set(target.connectionId, entry);
  entry.promise = Promise.resolve()
    .then(() => connect(target))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      // Retain one rejected attempt briefly. Every filesystem/git panel can
      // ask for the same unavailable host at once; without this cooldown each
      // call launches another ssh probe and creates an unbounded retry storm.
      const current = entries.get(target.connectionId);
      if (!current || current === entry) {
        entry.status = {
          connectionId: target.connectionId,
          state: "error",
          error: message,
        };
        entry.retryAfter = Date.now() + CONNECT_FAILURE_BACKOFF_MS;
        entries.set(target.connectionId, entry);
      }
      throw error;
    });
  return entry.promise;
}

export function connectionStatus(connectionId: string): SshConnectionStatus {
  return entries.get(connectionId)?.status ?? { connectionId, state: "idle" };
}

export async function disconnect(connectionId: string): Promise<void> {
  const entry = entries.get(connectionId);
  entries.delete(connectionId);
  if (!entry) return;
  try {
    const connection = await entry.promise;
    connection.child.kill();
  } catch {
    // A failed/closing connection already owns no persistent child.
  }
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...entries.keys()].map((id) => disconnect(id)));
}

export function liveConnections(): Array<{ id: string; label: string }> {
  return [...entries.values()].map((entry) => ({
    id: entry.status.connectionId,
    label: `${entry.status.connectionId} (${entry.status.state})`,
  }));
}
