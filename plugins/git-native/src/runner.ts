/**
 * Low-level git execution. Spawns `git` with the hardened env, bounds stdout/stderr, enforces
 * a timeout. WSL (`wsl.exe … --exec git`) is deferred to M7.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { GitError } from "./errors";
import { executionCapability } from "./runtime";

export const DEFAULT_TIMEOUT_SECS = 30;
export const MAX_TIMEOUT_SECS = 180;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export interface GitOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

const HARDENED_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  SSH_ASKPASS: "",
  GIT_OPTIONAL_LOCKS: "0",
  GCM_INTERACTIVE: "Never",
  GCM_PROVIDER: "",
  LC_ALL: "C",
};

function boundedConcat(chunks: Buffer[], cap: number): { buf: Buffer; truncated: boolean } {
  let total = 0;
  const kept: Buffer[] = [];
  let truncated = false;
  for (const c of chunks) {
    if (total >= cap) {
      truncated = true;
      break;
    }
    const take = Math.min(cap - total, c.length);
    kept.push(take < c.length ? c.subarray(0, take) : c);
    if (take < c.length) truncated = true;
    total += take;
  }
  return { buf: Buffer.concat(kept), truncated };
}

export function runGit(
  workspace: WorkspaceEnv,
  cwd: string | undefined,
  args: string[],
  timeoutSecs: number,
): Promise<GitOutput> {
  // SSH workspace: run git on the remote server. Same GitOutput shape, so every
  // operation/parser above this layer is unchanged.
  if (workspace && workspace.kind === "ssh") {
    return executionCapability().invoke<{
      stdout: Buffer;
      stderr: Buffer;
      exitCode: number | null;
      truncated: boolean;
    }>(workspace, { domain: "git", method: "run", args: [cwd, args] }).then((r) => ({
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
      // No remote timeout exists yet — this is honest rather than a placeholder.
      timedOut: false,
      truncated: r.truncated,
    }));
  }

  const dur = Math.min(Math.max(timeoutSecs, 1), MAX_TIMEOUT_SECS) * 1000;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("git", args, {
        cwd: cwd && cwd.length > 0 ? cwd : undefined,
        env: { ...process.env, ...HARDENED_ENV },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      reject(new GitError("spawn", `failed to spawn git: ${String(e)}`));
      return;
    }

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    child.stdout.on("data", (c: Buffer) => outChunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      const out = boundedConcat(outChunks, MAX_OUTPUT_BYTES);
      const err = boundedConcat(errChunks, MAX_OUTPUT_BYTES);
      resolve({
        stdout: out.buf,
        stderr: err.buf,
        exitCode: null,
        timedOut: true,
        truncated: out.truncated,
      });
    }, dur);

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GitError("spawn", `failed to spawn git: ${e.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = boundedConcat(outChunks, MAX_OUTPUT_BYTES);
      const err = boundedConcat(errChunks, MAX_OUTPUT_BYTES);
      resolve({
        stdout: out.buf,
        stderr: err.buf,
        exitCode: code,
        timedOut: false,
        truncated: out.truncated,
      });
    });
  });
}

export async function gitStdoutLineOpt(
  workspace: WorkspaceEnv,
  cwd: string,
  args: string[],
): Promise<string | null> {
  const output = await runGit(workspace, cwd, args, DEFAULT_TIMEOUT_SECS);
  if (output.timedOut) throw new GitError("timedOut", "git command timed out");
  if (output.exitCode !== 0) return null;
  const line = output.stdout.toString("utf8").split("\n")[0]?.trim();
  return line ? line : null;
}

export async function gitStdoutLines(
  workspace: WorkspaceEnv,
  cwd: string,
  args: string[],
): Promise<string[]> {
  const output = await runGit(workspace, cwd, args, DEFAULT_TIMEOUT_SECS);
  if (output.timedOut) throw new GitError("timedOut", "git command timed out");
  if (output.exitCode !== 0) return [];
  return output.stdout
    .toString("utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function ensureGitAvailable(workspace: WorkspaceEnv): Promise<void> {
  const output = await runGit(workspace, undefined, ["--version"], 5);
  if (output.exitCode !== 0) {
    throw GitError.command("git not available", output.stderr.toString("utf8").trim());
  }
}

/** Local canonical dir (registry gating deferred to M5). */
export function canonicalDir(cwd: string): string {
  try {
    return realpathSync(cwd);
  } catch {
    return cwd;
  }
}
