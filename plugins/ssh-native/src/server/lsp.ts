/**
 * Remote half of LSP support: a dumb byte proxy (the protocol intelligence
 * stays in the Electron main process) plus install/detect helpers. Servers are
 * spawned on this host, their stdio base64-chunked over the ssh RPC channel.
 *
 * Backpressure: the child's stdout pump is drain-gated against our own stdout
 * so a chatty language server can't balloon the ssh pipe.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { b64 } from "../protocol";

type Emit = (channel: number, event: string, data: unknown) => void;

type Handle = {
  child: ChildProcess;
  channel: number;
};

let nextHandle = 1;
const handles = new Map<number, Handle>();

export function lspSpawn(
  p: {
    /** null → the agent's own Node (the pinned bootstrap install). */
    command: string | null;
    args: string[];
    cwd: string;
    channel: number;
  },
  emit: Emit,
): { handle: number } {
  const child = spawn(p.command ?? process.execPath, p.args, {
    cwd: p.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  const handle = nextHandle++;
  handles.set(handle, { child, channel: p.channel });

  // Drain-gated pump: pause the child's stdout while our stdout (the ssh
  // pipe) signals backpressure.
  child.stdout?.on("data", (chunk: Buffer) => {
    const ok = safeEmit(emit, p.channel, "data", { chunkB64: b64.encode(chunk) });
    if (!ok) {
      child.stdout?.pause();
      process.stdout.once("drain", () => child.stdout?.resume());
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    emit(p.channel, "stderr", { chunkB64: b64.encode(chunk) });
  });
  child.on("exit", (code, signal) => {
    handles.delete(handle);
    emit(p.channel, "exit", { code, signal });
  });
  child.on("error", (e) => {
    handles.delete(handle);
    emit(p.channel, "stderr", { chunkB64: b64.encode(Buffer.from(String(e))) });
    emit(p.channel, "exit", { code: null, signal: null });
  });
  child.stdin?.on("error", () => {});
  return { handle };
}

/** emit returns void in main.ts; wrap stdout.write to observe backpressure. */
function safeEmit(
  emit: Emit,
  channel: number,
  event: string,
  data: unknown,
): boolean {
  emit(channel, event, data);
  // process.stdout.writableNeedDrain reflects the last write's return value.
  return !process.stdout.writableNeedDrain;
}

export function lspWrite(p: { handle: number; chunkB64: string }): null {
  const entry = handles.get(p.handle);
  if (!entry) throw new Error(`unknown lsp handle ${p.handle}`);
  const stdin = entry.child.stdin;
  if (stdin && !stdin.destroyed) stdin.write(b64.decode(p.chunkB64));
  return null;
}

export function lspKill(p: { handle: number; signal?: string }): null {
  const entry = handles.get(p.handle);
  if (entry) {
    handles.delete(p.handle);
    try {
      entry.child.kill((p.signal as NodeJS.Signals | undefined) ?? "SIGTERM");
    } catch {
      // already gone
    }
  }
  return null;
}

export function lspKillAll(): void {
  for (const [, entry] of handles) {
    try {
      entry.child.kill();
    } catch {
      // already gone
    }
  }
  handles.clear();
}

/** Batch `command -v` so PATH detection is one round trip. */
export function lspWhich(p: { bins: string[] }): {
  found: Record<string, string | null>;
} {
  const pathDirs = (process.env.PATH ?? "").split(":");
  const extra = [
    join(homedir(), ".cargo", "bin"),
    join(homedir(), "go", "bin"),
    join(homedir(), ".local", "bin"),
    "/usr/local/bin",
  ];
  const dirs = [...pathDirs, ...extra.filter((d) => !pathDirs.includes(d))];
  const found: Record<string, string | null> = {};
  for (const bin of p.bins) {
    found[bin] = null;
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = join(dir, bin);
      if (existsSync(candidate)) {
        found[bin] = candidate;
        break;
      }
    }
  }
  return { found };
}

/** Walk up from `path` for root markers — one round trip instead of N stats.
 * Mirrors findProjectRootLocal in electron/main/lsp/sessions.ts. */
export function lspFindRoot(p: {
  path: string;
  markers: string[];
  stopAt: string | null;
}): { root: string | null } {
  const stopAt = p.stopAt ?? homedir();
  let bestPriority = p.markers.length;
  let bestDir: string | null = null;
  let dir = dirname(p.path);
  for (;;) {
    for (let i = 0; i < p.markers.length && i <= bestPriority; i++) {
      if (existsSync(join(dir, p.markers[i]))) {
        bestPriority = i;
        bestDir = dir;
        break;
      }
    }
    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    if (p.stopAt && !dir.startsWith(p.stopAt)) break;
    dir = parent;
  }
  return { root: bestDir };
}

/** Existence probe for formatter binary candidates (node_modules/.bin). */
export function fmtExists(p: { paths: string[] }): { found: string[] } {
  return { found: p.paths.filter((path) => existsSync(path)) };
}

/**
 * Run a formatter CLI on this host: stdin in, formatted stdout back. PATH is
 * extended with the agent's own Node dir so `#!/usr/bin/env node` shims work
 * on hosts without a system node.
 */
export function fmtRun(p: {
  command: string;
  args: string[];
  cwd: string;
  stdinB64: string;
}): Promise<{ ok: boolean; stdoutB64?: string; error?: string }> {
  return new Promise((resolve) => {
    const nodeDir = dirname(process.execPath);
    const child = spawn(p.command, p.args, {
      cwd: p.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PATH: `${nodeDir}:${process.env.PATH ?? ""}` },
      timeout: 15_000,
    });
    const out: Buffer[] = [];
    let stderrTail = "";
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => {
      stderrTail = (stderrTail + c.toString("utf8")).slice(-600);
    });
    child.on("error", (e) => resolve({ ok: false, error: String(e) }));
    child.on("close", (code) => {
      if (code === 0 && out.length > 0) {
        resolve({ ok: true, stdoutB64: b64.encode(Buffer.concat(out)) });
      } else {
        resolve({ ok: false, error: stderrTail.trim() || `exited ${code}` });
      }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(b64.decode(p.stdinB64));
  });
}

const installsInFlight = new Set<string>();

/**
 * npm-install a server into ~/.termco-server/lsp/<pkg>@<ver> using the pinned
 * Node's bundled npm (invoked via npm-cli.js so no shebang/PATH node needed).
 */
export async function lspInstall(
  p: {
    npmPackage: string;
    version: string;
    extraPackages?: string[];
    bin?: string;
    channel: number;
  },
  emit: Emit,
): Promise<{ ok: boolean; binJs?: string; error?: string }> {
  const dir = join(
    homedir(),
    ".termco-server",
    "lsp",
    `${p.npmPackage}@${p.version}`,
  );
  const key = `${p.npmPackage}@${p.version}`;
  if (installsInFlight.has(key)) {
    return { ok: false, error: "install already in progress" };
  }
  const existing = resolveBinJs(dir, p.npmPackage, p.bin);
  if (existing) return { ok: true, binJs: existing };

  // The agent itself runs on the pinned bootstrap Node — its npm ships in the
  // same tree. Invoking npm-cli.js directly avoids any PATH/shebang node.
  const nodeBin = process.execPath;
  const npmCli = join(
    dirname(dirname(nodeBin)),
    "lib",
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (!existsSync(npmCli)) {
    return { ok: false, error: `npm not found next to agent node (${npmCli})` };
  }
  installsInFlight.add(key);
  try {
    mkdirSync(dir, { recursive: true });
    emit(p.channel, "progress", {
      phase: "installing",
      message: `Installing ${key} on remote…`,
    });
    const packages = [key, ...(p.extraPackages ?? [])];
    const result = await new Promise<{ code: number | null; stderr: string }>(
      (resolve) => {
        const child = spawn(
          nodeBin,
          [
            npmCli,
            "install",
            "--prefix",
            dir,
            "--no-fund",
            "--no-audit",
            "--loglevel=error",
            ...packages,
          ],
          { env: process.env, timeout: 300_000 },
        );
        let stderr = "";
        child.stderr?.on("data", (c: Buffer) => {
          stderr = (stderr + c.toString("utf8")).slice(-2000);
        });
        child.on("error", (e) => resolve({ code: null, stderr: String(e) }));
        child.on("close", (code) => resolve({ code, stderr }));
      },
    );
    if (result.code !== 0) {
      rmSync(dir, { recursive: true, force: true });
      return { ok: false, error: result.stderr.trim() || `npm exited ${result.code}` };
    }
    const binJs = resolveBinJs(dir, p.npmPackage, p.bin);
    if (!binJs) {
      return { ok: false, error: `installed but bin "${p.bin ?? p.npmPackage}" not found` };
    }
    emit(p.channel, "progress", { phase: "done", message: "Installed" });
    return { ok: true, binJs };
  } finally {
    installsInFlight.delete(key);
  }
}

/** Resolve the real bin JS from the installed package.json `bin` field —
 * same logic as electron/main/lsp/install.ts resolveInstalledBinJs. */
function resolveBinJs(
  dir: string,
  npmPackage: string,
  bin?: string,
): string | null {
  const pkgDir = join(dir, "node_modules", npmPackage);
  let pkg: { name?: string; bin?: string | Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const binName = bin ?? npmPackage;
  let rel: string | undefined;
  if (typeof pkg.bin === "string") {
    rel = binName === (pkg.name ?? npmPackage) ? pkg.bin : undefined;
  } else {
    rel = pkg.bin?.[binName];
  }
  if (!rel) return null;
  const abs = join(pkgDir, rel);
  return existsSync(abs) ? abs : null;
}
