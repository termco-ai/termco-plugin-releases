/**
 * Remote backend dispatch. When a workspace is `kind:"ssh"`, fs/git/search
 * operations run on the remote Termco Server via the connection's RpcClient
 * instead of local node:fs / git. Method names + payload shapes mirror the
 * server's handler table (server/src/main.ts); results come back in the exact
 * shapes the local handlers return, so callers/parsers are unchanged.
 */
import type { WorkspaceEnv } from "@termco/workspace-base";
import { emit } from "./events";
import { getConnection, type SshConnection } from "./connection";
import { b64 } from "./protocol";
import type { SshTarget } from "./types";

export interface LogSearchResult {
  matches: Array<{ line: number; text: string; before?: string[]; after?: string[] }>;
  scanned: number;
  matched: number;
  truncated: boolean;
  spawnError: boolean;
  timedOut: boolean;
}

export type SshWorkspace = { kind: "ssh"; connectionId: string; host: string; user?: string; port?: number };

export function isSshWorkspace(ws: WorkspaceEnv): ws is SshWorkspace {
  return !!ws && ws.kind === "ssh";
}

function targetOf(ws: SshWorkspace): SshTarget {
  return { connectionId: ws.connectionId, host: ws.host, user: ws.user, port: ws.port };
}

export async function call<T>(ws: SshWorkspace, method: string, params?: unknown): Promise<T> {
  const conn = await getConnection(targetOf(ws));
  return conn.client.call<T>(method, params);
}

/** File operations over the provider-owned remote server, workspace-first. */
export const sshFs = {
  readFile: (ws: SshWorkspace, path: string) => call(ws, "fs.readFile", { path }),
  writeFile: (ws: SshWorkspace, path: string, content: string) =>
    call<null>(ws, "fs.writeFile", { path, contentB64: b64.encode(Buffer.from(content, "utf8")) }),
  canonicalize: (ws: SshWorkspace, path: string) => call<string>(ws, "fs.canonicalize", { path }),
  stat: (ws: SshWorkspace, path: string) => call(ws, "fs.stat", { path }),
  readDir: (ws: SshWorkspace, path: string, showHidden: boolean, gitDecorations?: boolean) =>
    call(ws, "fs.readDir", { path, showHidden, gitDecorations }),
  listSubdirs: (ws: SshWorkspace, path: string, showHidden: boolean) =>
    call<string[]>(ws, "fs.listSubdirs", { path, showHidden }),
  createFile: (ws: SshWorkspace, path: string) => call<null>(ws, "fs.createFile", { path }),
  createDir: (ws: SshWorkspace, path: string) => call<null>(ws, "fs.createDir", { path }),
  rename: (ws: SshWorkspace, from: string, to: string) => call<null>(ws, "fs.rename", { from, to }),
  delete: (ws: SshWorkspace, path: string) => call<null>(ws, "fs.delete", { path }),
  copy: (ws: SshWorkspace, sources: string[], destDir: string) =>
    call<null>(ws, "fs.copy", { sources, destDir }),
  search: (ws: SshWorkspace, params: Record<string, unknown>) => call(ws, "fs.search", params),
  listFiles: (ws: SshWorkspace, params: Record<string, unknown>) => call(ws, "fs.listFiles", params),
  grep: (ws: SshWorkspace, params: Record<string, unknown>) => call(ws, "fs.grep", params),
  glob: (ws: SshWorkspace, params: Record<string, unknown>) => call(ws, "fs.glob", params),
};

// One watch channel per connection; the server emits `changed` on it and we
// re-broadcast `fs:changed` locally (identical explorer contract to WSL/local).
const watchChannels = new WeakMap<SshConnection, number>();

async function ensureWatchChannel(ws: SshWorkspace): Promise<SshConnection> {
  const conn = await getConnection(targetOf(ws));
  if (watchChannels.get(conn) == null) {
    const channel = conn.client.openChannel((event, data) => {
      if (event === "changed") emit("fs:changed", data);
    });
    watchChannels.set(conn, channel);
  }
  return conn;
}

export async function sshWatchAdd(ws: SshWorkspace, paths: string[]): Promise<void> {
  const conn = await ensureWatchChannel(ws);
  await conn.client.call("fs.watchAdd", { paths, channel: watchChannels.get(conn) });
}

export async function sshWatchRemove(ws: SshWorkspace, paths: string[]): Promise<void> {
  const conn = await getConnection(targetOf(ws));
  await conn.client.call("fs.watchRemove", { paths });
}

// --- Shell exec over the server -------------------------------------------
// Session/bg handles are proxied through a large offset so remote handles never
// collide with local ones; the proxy remembers which connection owns it (the
// "capture the host at creation" pattern for handle-keyed follow-up calls).
let nextProxy = 1_000_000;
const shellHandles = new Map<number, { ws: SshWorkspace; handle: number }>();

export function isSshShellHandle(proxy: number): boolean {
  return shellHandles.has(proxy);
}

export function sshShellRun(ws: SshWorkspace, command: string, cwd: string | undefined, timeoutSecs: number | undefined) {
  return call(ws, "shell.run", { command, cwd, timeoutSecs });
}

async function proxyOpen(ws: SshWorkspace, method: string, params: unknown): Promise<number> {
  const handle = await call<number>(ws, method, params);
  const proxy = nextProxy++;
  shellHandles.set(proxy, { ws, handle });
  return proxy;
}

export const sshShellSessionOpen = (ws: SshWorkspace, cwd: string | undefined) =>
  proxyOpen(ws, "shell.sessionOpen", { cwd });

export function sshShellSessionRun(
  proxy: number,
  command: string,
  cwd: string | undefined,
  timeoutSecs: number | undefined,
) {
  const e = shellHandles.get(proxy);
  if (!e) throw new Error("unknown ssh shell session");
  return call(e.ws, "shell.sessionRun", { id: e.handle, command, cwd, timeoutSecs });
}

export function sshShellSessionClose(proxy: number): Promise<unknown> {
  const e = shellHandles.get(proxy);
  if (!e) return Promise.resolve(null);
  shellHandles.delete(proxy);
  return call(e.ws, "shell.sessionClose", { id: e.handle });
}

export const sshShellBgSpawn = (ws: SshWorkspace, command: string, cwd: string | undefined) =>
  proxyOpen(ws, "shell.bgSpawn", { command, cwd });

export function sshShellBgLogs(proxy: number, sinceOffset: number | undefined) {
  const e = shellHandles.get(proxy);
  if (!e) throw new Error("unknown ssh bg handle");
  return call(e.ws, "shell.bgLogs", { handle: e.handle, sinceOffset });
}

export function sshShellBgKill(proxy: number): Promise<unknown> {
  const e = shellHandles.get(proxy);
  if (!e) return Promise.resolve(null);
  return call(e.ws, "shell.bgKill", { handle: e.handle });
}

/** Host-level network introspection on the remote server. */
export const sshNet = {
  listeningPorts: (ws: SshWorkspace) =>
    call<
      Array<{
        port: number;
        addresses: string[];
        loopbackOnly: boolean;
        process: string | null;
      }>
    >(ws, "net.listeningPorts", {}),
};

/** Container runtime ops over the remote server. */
export const sshContainers = {
  list: (ws: SshWorkspace) => call(ws, "containers.list"),
  action: (ws: SshWorkspace, runtime: string, id: string, action: string) =>
    call<null>(ws, "containers.action", { runtime, id, action }),
  logs: (ws: SshWorkspace, runtime: string, id: string, tail: number | null) =>
    call<string>(ws, "containers.logs", { runtime, id, tail }),
  logsSearch: (
    ws: SshWorkspace,
    runtime: string,
    id: string,
    query: string,
    opts: {
      maxMatches?: number;
      regex?: boolean;
      context?: number;
      caseSensitive?: boolean;
    },
  ) =>
    call<LogSearchResult>(ws, "containers.logsSearch", {
      runtime,
      id,
      query,
      maxMatches: opts.maxMatches,
      regex: opts.regex,
      context: opts.context,
      caseSensitive: opts.caseSensitive,
    }),
  inspect: (ws: SshWorkspace, runtime: string, id: string) =>
    call<string>(ws, "containers.inspect", { runtime, id }),
  stats: (ws: SshWorkspace, runtime: string, id: string) =>
    call(ws, "containers.stats", { runtime, id }),
  imageInspect: (ws: SshWorkspace, runtime: string, image: string) =>
    call<string>(ws, "containers.imageInspect", { runtime, image }),
};

/** Run git on the remote; returns raw stdout/stderr bytes like the local runner. */
export async function sshGitRun(
  ws: SshWorkspace,
  cwd: string | undefined,
  args: string[],
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number | null; truncated: boolean }> {
  const res = await call<{
    stdoutB64: string;
    stderrB64: string;
    code: number | null;
    // Absent when talking to a server built before this was reported.
    truncated?: boolean;
  }>(ws, "git.run", { cwd: cwd ?? "", args });
  return {
    stdout: b64.decode(res.stdoutB64),
    stderr: b64.decode(res.stderrB64),
    exitCode: res.code,
    truncated: res.truncated === true,
  };
}
