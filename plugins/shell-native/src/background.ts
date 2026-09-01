/**
 * Long-running background processes. Output streams
 * into a 4 MiB ring buffer; logs are polled by offset. snake_case wire types.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { BoundedRingBuffer } from "./ringbuffer";
import { buildOneshotArgs } from "./oneshot";
import type { WorkspaceEnv } from "@termco/workspace-base";

const RING_CAP = 4 * 1024 * 1024;

export interface BackgroundLogResponse {
  bytes: string;
  next_offset: number;
  dropped: number;
  exited: boolean;
  exit_code: number | null;
}
export interface BackgroundProcInfo {
  handle: number;
  command: string;
  cwd: string | null;
  started_at_ms: number;
  exited: boolean;
  exit_code: number | null;
}

interface Proc {
  handle: number;
  command: string;
  cwd: string | null;
  startedAtMs: number;
  child: ChildProcess;
  buffer: BoundedRingBuffer;
  exited: boolean;
  exitCode: number | null;
  exitUnknown: boolean;
}

const procs = new Map<number, Proc>();
let nextHandle = 1;

export function bgSpawn(command: string, cwd: string | undefined, _ws: WorkspaceEnv): number {
  const dir = cwd?.trim() ? cwd.trim() : undefined;
  const { file, prefix } = buildOneshotArgs();
  const child = spawn(file, [...prefix, command], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
  const handle = nextHandle++;
  const proc: Proc = {
    handle,
    command,
    cwd: dir ?? null,
    startedAtMs: Date.now(),
    child,
    buffer: new BoundedRingBuffer(RING_CAP),
    exited: false,
    exitCode: null,
    exitUnknown: false,
  };
  child.stdout?.on("data", (c: Buffer) => proc.buffer.push(c));
  child.stderr?.on("data", (c: Buffer) => proc.buffer.push(c));
  child.on("close", (code) => {
    proc.exited = true;
    if (code == null) proc.exitUnknown = true;
    else proc.exitCode = code;
  });
  child.on("error", () => {
    proc.exited = true;
    proc.exitUnknown = true;
  });
  procs.set(handle, proc);
  return handle;
}

export function bgLogs(handle: number, sinceOffset: number | undefined): BackgroundLogResponse {
  const proc = procs.get(handle);
  if (!proc) throw new Error("no such background process");
  const [bytes, nextOffset, dropped] = proc.buffer.readFrom(sinceOffset ?? 0);
  const exitCode = proc.exited && !proc.exitUnknown ? proc.exitCode : null;
  return {
    bytes: Buffer.from(bytes).toString("utf8"),
    next_offset: nextOffset,
    dropped,
    exited: proc.exited,
    exit_code: exitCode,
  };
}

export function bgKill(handle: number): void {
  const proc = procs.get(handle);
  if (!proc) throw new Error("no such background process");
  try {
    proc.child.kill("SIGKILL");
  } catch {
    /* already dead */
  }
}

export function bgList(): BackgroundProcInfo[] {
  return [...procs.values()].map((p) => ({
    handle: p.handle,
    command: p.command,
    cwd: p.cwd,
    started_at_ms: p.startedAtMs,
    exited: p.exited,
    exit_code: p.exited && !p.exitUnknown ? p.exitCode : null,
  }));
}

export function bgCloseAll(): void {
  for (const proc of procs.values()) {
    try {
      if (!proc.exited) proc.child.kill("SIGKILL");
    } catch {
      // Best-effort process teardown continues for the remaining jobs.
    }
  }
  procs.clear();
}
