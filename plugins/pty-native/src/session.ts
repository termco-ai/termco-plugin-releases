/**
 * PTY session lifecycle via node-pty (the reader/flusher/waiter machinery).
 *
 * Output path: node-pty data → DaFilter (answers DA/CPR queries inline) →
 * coalesce for ~4ms → send one chunk over the data channel. A 4 MiB pending cap
 * drops backlog with an SGR-reset notice rather than slicing a CSI sequence.
 */
import { spawn as ptySpawn, type IPty } from "node-pty";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceCapability, WorkspaceEnv } from "@termco/workspace-base";
import { AgentDetector, intoSignal } from "./agentDetect";
import { DaFilter } from "./daFilter";
import { buildSshSpawn, buildSpawn, type SshSpawnPrep } from "./shellInit";

interface PtySessionDependencies {
  workspace: WorkspaceCapability;
  events: ApplicationEventsCapability;
}

let dependencies: PtySessionDependencies | null = null;

export function configurePtySessions(value: PtySessionDependencies | null): void {
  dependencies = value;
}

export function ptySessionsConfigured(): boolean {
  return dependencies !== null;
}

function deps(): PtySessionDependencies {
  if (!dependencies) throw new Error("pty session provider is not configured");
  return dependencies;
}

const FLUSH_COALESCE_MS = 4;
const MAX_PENDING = 4 * 1024 * 1024;
const OVERFLOW_NOTICE = new TextEncoder().encode(
  "\x1bc\x1b[2m[termco: dropped output due to backpressure]\x1b[0m\r\n",
);

type Sender = (message: unknown) => void;

interface Session {
  id: number;
  pty: IPty;
  shellPid: number;
  onData: Sender;
  onExit: Sender;
  daFilter: DaFilter;
  agentDetect: AgentDetector;
  pending: number[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  droppedBytes: number;
  exited: boolean;
}

const sessions = new Map<number, Session>();
let nextId = 1; // never 0 — the frontend treats 0 as "unset".

export interface OpenParams {
  cols: number;
  rows: number;
  cwd?: string | null;
  blocks?: boolean | null;
  shell?: string | null;
  workspace?: WorkspaceEnv | null;
  /** Resolved remote shell-integration (uploaded by pty_open before spawn). */
  sshPrep?: SshSpawnPrep | null;
}

export function open(params: OpenParams, onData: Sender, onExit: Sender): number {
  const ws = params.workspace;
  let spec;
  if (ws && ws.kind === "ssh") {
    // Remote terminal via sshd's PTY; cwd is a *remote* path, nothing local to authorize.
    spec = buildSshSpawn(ws, params.cwd ?? undefined, params.blocks ?? false, params.sshPrep ?? undefined);
  } else {
    spec = buildSpawn(params.cwd ?? undefined, params.blocks ?? false, params.shell ?? undefined);
    // authorize_user_spawn_cwd: register the spawn cwd as an authorized root.
    if (spec.cwd) {
      try {
        deps().workspace.authorizeRoot(spec.cwd);
      } catch {
        /* cwd vanished — pty still spawns from the resolved dir */
      }
    }
  }
  const pty = ptySpawn(spec.file, spec.args, {
    name: "xterm-256color",
    cols: params.cols,
    rows: params.rows,
    cwd: spec.cwd,
    env: spec.env,
  });

  const id = nextId++;
  if (process.env.TERMCO_PTY_DEBUG) {
    console.log(`[pty] open id=${id} pid=${pty.pid} file=${spec.file} args=${JSON.stringify(spec.args)}`);
  }
  const session: Session = {
    id,
    pty,
    shellPid: pty.pid,
    onData,
    onExit,
    daFilter: new DaFilter(),
    agentDetect: new AgentDetector(),
    pending: [],
    flushTimer: null,
    droppedBytes: 0,
    exited: false,
  };
  sessions.set(id, session);

  pty.onData((data) => {
    // node-pty decodes to a UTF-8 string; re-encode to the original bytes so the
    // ghostty VT parser sees raw bytes.
    const bytes = new TextEncoder().encode(data);
    // Classify agent lifecycle from the raw stream (before DA filtering), and
    // broadcast termco:agent-signal.
    session.agentDetect.process(bytes, (t) =>
      deps().events.emit("termco:agent-signal", intoSignal(t, session.id)),
    );
    const filtered: number[] = [];
    session.daFilter.process(bytes, filtered, (reply) => {
      // Answer DA/CPR queries by writing back into the pty.
      session.pty.write(Buffer.from(reply).toString("latin1"));
    });
    if (filtered.length === 0) return;

    if (session.pending.length + filtered.length > MAX_PENDING) {
      session.droppedBytes += session.pending.length;
      session.pending = Array.from(OVERFLOW_NOTICE);
    }
    for (const b of filtered) session.pending.push(b);
    scheduleFlush(session);
  });

  pty.onExit(({ exitCode }) => {
    session.exited = true;
    session.agentDetect.finish((t) =>
      deps().events.emit("termco:agent-signal", intoSignal(t, session.id)),
    );
    flush(session);
    session.onExit(exitCode);
    sessions.delete(id);
  });

  return id;
}

function scheduleFlush(session: Session): void {
  if (session.flushTimer) return;
  session.flushTimer = setTimeout(() => flush(session), FLUSH_COALESCE_MS);
}

function flush(session: Session): void {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
    session.flushTimer = null;
  }
  if (session.pending.length === 0) return;
  const chunk = Uint8Array.from(session.pending);
  session.pending = [];
  if (process.env.TERMCO_PTY_DEBUG) {
    console.log(`[pty] flush id=${session.id} bytes=${chunk.length}`);
  }
  session.onData(chunk);
}

export function write(id: number, bytes: Uint8Array): void {
  const session = sessions.get(id);
  if (!session) return;
  session.pty.write(Buffer.from(bytes).toString("utf8"));
}

export function resize(id: number, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.pty.resize(cols, rows);
  } catch {
    // child already exited
  }
}

export function close(id: number): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  // Windows: ConPTY doesn't reap the child tree; force-kill it via taskkill /T.
  // Fire-and-forget async — a sync fork here would stall the main thread per
  // closed tab, and pty.kill() below doesn't depend on it.
  if (process.platform === "win32" && session.shellPid > 0) {
    try {
      execFile("taskkill", ["/pid", String(session.shellPid), "/T", "/F"], () => {
        /* best effort */
      });
    } catch {
      // fall through to pty.kill
    }
  }
  try {
    session.pty.kill();
  } catch {
    // already dead
  }
}

export function closeAll(): number {
  const count = sessions.size;
  for (const id of [...sessions.keys()]) close(id);
  return count;
}

export function liveSessions(): Array<{ id: string; label: string }> {
  return [...sessions.values()].map((session) => ({
    id: String(session.id),
    label: `terminal ${session.id} (pid ${session.shellPid})`,
  }));
}

/** True when the shell has at least one child process. */
const execFileAsync = promisify(execFile);

// Async on purpose: these run inside IPC handlers on the main-process main
// thread, per pane and re-checked around tab switches — the old spawnSync
// `ps`/`pgrep` forks added up to visible main-thread hitches.
export async function hasForegroundProcess(id: number): Promise<boolean> {
  const session = sessions.get(id);
  if (!session || session.shellPid === 0) return false;
  if (process.platform === "win32") {
    // Toolhelp-snapshot equivalent: any process whose parent is the shell.
    try {
      const out = await execFileAsync(
        "wmic",
        ["process", "where", `ParentProcessId=${session.shellPid}`, "get", "ProcessId"],
        { encoding: "utf8" },
      );
      return /\d/.test((out.stdout ?? "").replace("ProcessId", ""));
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync("pgrep", ["-P", String(session.shellPid)]);
    return true; // exit 0 = at least one child
  } catch {
    return false; // non-zero exit (no children) or spawn failure
  }
}

/**
 * Foreground-job check — the exact `tcgetpgrp` semantics: a job owns the tty when
 * the tty's foreground process-group (tpgid) differs from the shell's own pgid.
 * We read both from `ps`.
 */
export async function hasForegroundJob(id: number): Promise<boolean> {
  const session = sessions.get(id);
  if (!session || session.shellPid === 0) return false;
  if (process.platform === "win32") return hasForegroundProcess(id);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "ps",
      ["-o", "pgid=,tpgid=", "-p", String(session.shellPid)],
      { encoding: "utf8" },
    ));
  } catch {
    return false;
  }
  const parts = stdout.trim().split(/\s+/);
  const pgid = Number.parseInt(parts[0] ?? "", 10);
  const tpgid = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(tpgid) && tpgid > 0 && tpgid !== pgid;
}
