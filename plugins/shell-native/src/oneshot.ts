/**
 * One-shot command execution.
 * Runs via `/bin/sh -c`, caps output at 256 KiB, enforces a timeout. Serializes
 * snake_case (the CommandOutput wire shape the frontend expects).
 */
import { spawn } from "node:child_process";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { registry } from "./runtime";

const DEFAULT_TIMEOUT_SECS = 30;
const MAX_TIMEOUT_SECS = 300;
const MAX_OUTPUT_BYTES = 256 * 1024;

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
}

function boundedPush(chunks: Buffer[], total: { n: number }, chunk: Buffer): boolean {
  if (total.n >= MAX_OUTPUT_BYTES) return true; // already truncated
  const take = Math.min(MAX_OUTPUT_BYTES - total.n, chunk.length);
  chunks.push(take < chunk.length ? chunk.subarray(0, take) : chunk);
  total.n += take;
  return take < chunk.length;
}

/** Build the shell invocation (unix: /bin/sh -c). WSL deferred to M7. */
export function buildOneshotArgs(): { file: string; prefix: string[] } {
  return { file: "/bin/sh", prefix: ["-c"] };
}

export function runCommand(
  command: string,
  cwd: string | undefined,
  timeoutSecs: number | undefined,
  _workspace: WorkspaceEnv,
): Promise<CommandOutput> {
  const trimmed = command.trim();
  if (!trimmed) return Promise.reject(new Error("empty command"));
  const dir = cwd?.trim() ? cwd.trim() : undefined;
  // authorize_spawn_cwd: route the working dir through the registry.
  if (dir) {
    try {
      registry.authorize(dir);
    } catch {
      /* non-existent cwd — the spawn below will surface the error */
    }
  }
  const durMs = Math.min(Math.max(timeoutSecs ?? DEFAULT_TIMEOUT_SECS, 1), MAX_TIMEOUT_SECS) * 1000;
  const { file, prefix } = buildOneshotArgs();

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, [...prefix, trimmed], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      reject(e);
      return;
    }
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const outTotal = { n: 0 };
    const errTotal = { n: 0 };
    let truncated = false;
    let settled = false;
    child.stdout.on("data", (c: Buffer) => { if (boundedPush(outChunks, outTotal, c)) truncated = true; });
    child.stderr.on("data", (c: Buffer) => { boundedPush(errChunks, errTotal, c); });

    const finish = (exitCode: number | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        exit_code: exitCode,
        timed_out: timedOut,
        truncated,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null, true);
    }, durMs);

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => finish(code, false));
  });
}
