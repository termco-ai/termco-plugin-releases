/**
 * Server acquisition: resolve how to launch a configured server (managed
 * install dir first, then the user's shell PATH), and auto-install npm-based
 * servers into `<userData>/lsp/<pkg>@<version>`. Installed pure-JS servers run
 * on Electron's own Node (`ELECTRON_RUN_AS_NODE`), so only *installing*
 * requires npm on the machine — running does not.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LspServerConfig } from "./types";
import { whichOnUserPath } from "./userPath";

export type ResolvedLaunch = {
  command: string;
  args: string[];
  env?: Record<string, string>;
  source: "installed" | "path" | "config";
  /** node_modules dir of the managed install (for ${serverModules} args). */
  serverModules?: string;
};

export type InstallProgress = {
  phase: "resolving" | "installing" | "done" | "error";
  message: string;
};

let configuredInstallRoot: string | null = null;

export function lspInstallRootActive(): boolean {
  return configuredInstallRoot !== null;
}

/** Main-process lifecycle seam plus deterministic test override. */
export function configureLspInstallRoot(root: string | null): void {
  configuredInstallRoot = root;
}

export function installRoot(): string {
  if (!configuredInstallRoot) {
    throw new Error("lsp-native install root is not configured");
  }
  return configuredInstallRoot;
}

export function installDirFor(config: LspServerConfig): string | null {
  const auto = config.autoInstall;
  if (!auto) return null;
  return join(installRoot(), `${auto.npmPackage}@${auto.version}`);
}

/**
 * Absolute path of the real bin *JS file* (not the `.bin` shebang shim) for an
 * installed npm package, resolved from the package.json `bin` field.
 */
export function resolveInstalledBinJs(
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

/**
 * How to launch this server locally: managed install (run through Electron's
 * Node) → user PATH → config command verbatim (custom absolute paths).
 */
export async function resolveLocalLaunch(
  config: LspServerConfig,
): Promise<ResolvedLaunch | null> {
  const dir = installDirFor(config);
  if (dir) {
    const binJs = resolveInstalledBinJs(
      dir,
      config.autoInstall?.npmPackage ?? "",
      config.autoInstall?.bin,
    );
    if (binJs) {
      return {
        command: process.execPath,
        args: [binJs, ...config.args],
        env: { ELECTRON_RUN_AS_NODE: "1" },
        source: "installed",
        serverModules: join(dir, "node_modules"),
      };
    }
  }
  const onPath = await whichOnUserPath(config.command);
  if (onPath) {
    return { command: onPath, args: config.args, source: "path" };
  }
  // Custom servers may use an absolute path or rely on spawn's own lookup.
  if (config.custom || config.command.includes("/")) {
    return { command: config.command, args: config.args, source: "config" };
  }
  return null;
}

/** Detection status for the settings UI (without spawning anything). */
export async function detectServer(
  config: LspServerConfig,
): Promise<"installed" | "found" | "missing"> {
  const launch = await resolveLocalLaunch(config);
  if (!launch) return "missing";
  return launch.source === "installed" ? "installed" : "found";
}

const installsInFlight = new Map<string, Promise<void>>();

/**
 * npm-install a curated server into the managed dir. One install per server at
 * a time; progress streams to `onProgress`. Rejects with npm's stderr tail.
 */
export function installServer(
  config: LspServerConfig,
  onProgress: (p: InstallProgress) => void,
): Promise<void> {
  const auto = config.autoInstall;
  if (!auto) {
    return Promise.reject(
      new Error(`server "${config.id}" has no auto-install recipe`),
    );
  }
  const existing = installsInFlight.get(config.id);
  if (existing) return existing;
  const run = doInstall(config, onProgress).finally(() =>
    installsInFlight.delete(config.id),
  );
  installsInFlight.set(config.id, run);
  return run;
}

async function doInstall(
  config: LspServerConfig,
  onProgress: (p: InstallProgress) => void,
): Promise<void> {
  const auto = config.autoInstall;
  if (!auto) throw new Error("no auto-install recipe");
  onProgress({ phase: "resolving", message: "Locating npm…" });
  const npm = await whichOnUserPath(process.platform === "win32" ? "npm" : "npm");
  if (!npm) {
    throw new Error(
      "npm not found on PATH — install Node.js/npm, or install the server manually and it will be picked up from PATH",
    );
  }
  const dir = installDirFor(config);
  if (!dir) throw new Error("no install dir");
  mkdirSync(dir, { recursive: true });
  const packages = [
    `${auto.npmPackage}@${auto.version}`,
    ...(auto.extraPackages ?? []),
  ];
  onProgress({
    phase: "installing",
    message: `Installing ${packages.join(", ")}…`,
  });
  await new Promise<void>((resolve, reject) => {
    execFile(
      npm,
      [
        "install",
        "--prefix",
        dir,
        "--no-fund",
        "--no-audit",
        "--loglevel=error",
        ...packages,
      ],
      { timeout: 300_000, env: { ...process.env } },
      (err, _stdout, stderr) => {
        if (err) {
          // A failed partial install must not shadow PATH resolution later.
          try {
            rmSync(dir, { recursive: true, force: true });
          } catch {
            // best effort
          }
          reject(new Error(stderr?.trim().slice(-800) || String(err)));
        } else {
          resolve();
        }
      },
    );
  });
  const binJs = resolveInstalledBinJs(dir, auto.npmPackage, auto.bin);
  if (!binJs) {
    throw new Error(
      `install completed but bin "${auto.bin ?? auto.npmPackage}" was not found in ${auto.npmPackage}`,
    );
  }
  onProgress({ phase: "done", message: "Installed" });
}
