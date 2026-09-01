/**
 * Transport abstraction the LSP client sits on: a pair of plain byte streams
 * plus process control. Local = child_process; ssh = byte proxy through the
 * remote node agent (M5). One client codepath drives both.
 */
import { spawn } from "node:child_process";
import { Writable, type Readable } from "node:stream";

export type LspTransport = {
  reader: Readable;
  writer: Writable;
  /** Best-effort process kill; safe to call twice. */
  kill(): void;
  onExit(cb: (code: number | null) => void): void;
  /** Last stderr output — surfaced in error statuses after a crash. */
  stderrTail(): string;
  pid?: number;
};

export function spawnLocalTransport(
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): LspTransport {
  const child = spawn(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(env ?? {}) },
  });
  const exitCbs: Array<(code: number | null) => void> = [];
  let exited = false;
  const fireExit = (code: number | null) => {
    if (exited) return;
    exited = true;
    for (const cb of exitCbs) cb(code);
  };
  child.on("exit", (code) => fireExit(code));
  let stderrTail = "";
  // Spawn failures (ENOENT) surface as "error" without an exit event.
  child.on("error", (e) => {
    stderrTail = String(e);
    fireExit(null);
  });
  child.stderr?.on("data", (c: Buffer) => {
    stderrTail = (stderrTail + c.toString("utf8")).slice(-2000);
  });
  child.stdin?.on("error", () => {});
  // Writes racing a crash/failed spawn are dropped silently — exit handling
  // surfaces the failure; an ERR_STREAM_DESTROYED here would only produce
  // unhandled rejections inside the jsonrpc writer.
  const guardedWriter = new Writable({
    write(chunk, encoding, cb) {
      if (exited || !child.stdin || child.stdin.destroyed) {
        cb();
        return;
      }
      child.stdin.write(chunk, encoding, () => cb());
    },
  });
  return {
    // stdout is always present with stdio:["pipe","pipe","pipe"].
    reader: child.stdout as Readable,
    writer: guardedWriter,
    kill: () => {
      try {
        child.kill();
      } catch {
        // already gone
      }
    },
    onExit: (cb) => {
      if (exited) cb(null);
      else exitCbs.push(cb);
    },
    stderrTail: () => stderrTail,
    pid: child.pid,
  };
}
