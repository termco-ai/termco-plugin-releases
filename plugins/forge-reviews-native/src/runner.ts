import { spawn } from "node:child_process";
import type { WorkspaceEnv, WorkspaceExecutionCapability } from "@termco/workspace-base";
import {
  clearForgeExecutableCache,
  forgeExecutableEnvironment,
  resolveForgeExecutable,
} from "./executableDiscovery";

export const MAX_FORGE_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_REVIEW_DIFF_OUTPUT_BYTES = 128 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ForgeCommand {
  executable: "gh" | "glab" | "tea" | "brew" | "winget";
  args: readonly string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  stdin?: string;
}

export interface ForgeCommandOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  notFound: boolean;
}

export type ForgeCommandRunner = (
  command: ForgeCommand,
  workspace: WorkspaceEnv,
) => Promise<ForgeCommandOutput>;

export interface ForgeRunner {
  run: ForgeCommandRunner;
  clearExecutableCache(): void;
}

const HARDENED_ENV = {
  NO_COLOR: "1",
  CLICOLOR: "0",
  PAGER: "cat",
  GH_PAGER: "cat",
  GLAB_PAGER: "cat",
  GH_PROMPT_DISABLED: "1",
  TERM: "dumb",
};
const wslExecutableCache = new Map<string, string | null>();

async function resolveWslExecutable(
  executable: ForgeCommand["executable"],
  workspace: Extract<WorkspaceEnv, { kind: "wsl" }>,
): Promise<string | null> {
  const cacheKey = `${workspace.distro}:${executable}`;
  if (wslExecutableCache.has(cacheKey)) return wslExecutableCache.get(cacheKey) ?? null;
  const output = await runSpawn(
    "wsl.exe",
    ["--distribution", workspace.distro, "--exec", "sh", "-lc", `command -v ${executable}`],
    undefined,
    5_000,
  );
  if (output.exitCode !== 0) {
    wslExecutableCache.set(cacheKey, null);
    return null;
  }
  const resolved = output.stdout.trim().split("\n").pop() ?? "";
  const value = resolved.startsWith("/") ? resolved : null;
  wslExecutableCache.set(cacheKey, value);
  return value;
}

function runSpawn(
  executable: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
  maxOutputBytes = MAX_FORGE_OUTPUT_BYTES,
  stdin?: string,
): Promise<ForgeCommandOutput> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let keptBytes = 0;
    let truncated = false;
    let settled = false;
    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env: forgeExecutableEnvironment({ ...process.env, ...HARDENED_ENV }),
        stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: null,
        timedOut: false,
        truncated: false,
        notFound: true,
      });
      return;
    }
    const collect = (target: Buffer[], chunk: Buffer) => {
      const take = Math.min(chunk.length, maxOutputBytes - keptBytes);
      if (take > 0) {
        target.push(chunk.subarray(0, take));
        keptBytes += take;
      }
      if (take < chunk.length) truncated = true;
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    const finish = (input: Partial<ForgeCommandOutput>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode: input.exitCode ?? null,
        timedOut: input.timedOut ?? false,
        truncated,
        notFound: input.notFound ?? false,
      });
    };
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        finish({ timedOut: true });
      },
      Math.min(Math.max(timeoutMs, 1_000), 120_000),
    );
    child.on("error", (error: NodeJS.ErrnoException) => {
      collect(stderr, Buffer.from(error.message));
      finish({ notFound: error.code === "ENOENT" });
    });
    let inputFailed = false;
    child.stdin?.on("error", (error: Error) => {
      inputFailed = true;
      collect(stderr, Buffer.from(error.message));
      // Keep collecting the CLI's diagnostic and wait for close (or timeout).
      // A partial input is never a successful publication, even with exit 0.
    });
    child.on("close", (exitCode) => finish({ exitCode: inputFailed ? null : exitCode }));
    if (stdin !== undefined) child.stdin?.end(stdin);
  });
}

async function runLocal(
  command: ForgeCommand,
  workspace: WorkspaceEnv,
): Promise<ForgeCommandOutput> {
  const isWsl = workspace?.kind === "wsl";
  const resolved = isWsl
    ? await resolveWslExecutable(command.executable, workspace)
    : await resolveForgeExecutable(command.executable);
  if (!resolved) {
    return {
      stdout: "",
      stderr: `${command.executable} was not found in the active environment.`,
      exitCode: null,
      timedOut: false,
      truncated: false,
      notFound: true,
    };
  }
  const executable = isWsl ? "wsl.exe" : resolved;
  const args = isWsl
    ? [
        "--distribution",
        workspace.distro,
        ...(command.cwd ? ["--cd", command.cwd] : []),
        "--exec",
        resolved,
        ...command.args,
      ]
    : [...command.args];
  return runSpawn(
    executable,
    args,
    isWsl ? undefined : command.cwd,
    command.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    Math.min(
      Math.max(command.maxOutputBytes ?? MAX_FORGE_OUTPUT_BYTES, 1),
      MAX_REVIEW_DIFF_OUTPUT_BYTES,
    ),
    command.stdin,
  );
}

export function createForgeCommandRunner(execution: WorkspaceExecutionCapability): ForgeRunner {
  let refreshRemoteExecutables = false;
  return {
    run: async (command, workspace) => {
      if (workspace?.kind !== "ssh") return runLocal(command, workspace);
      return execution
        .invoke<ForgeCommandOutput>(workspace, {
          domain: "forge",
          method: "run",
          args: [
            {
              executable: command.executable,
              args: [...command.args],
              cwd: command.cwd,
              timeoutMs: command.timeoutMs,
              maxOutputBytes: command.maxOutputBytes,
              stdin: command.stdin,
              refreshExecutable: refreshRemoteExecutables,
            },
          ],
        })
        .finally(() => {
          refreshRemoteExecutables = false;
        });
    },
    clearExecutableCache() {
      clearForgeExecutableCache();
      wslExecutableCache.clear();
      refreshRemoteExecutables = true;
    },
  };
}
