import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import type {
  WorkspaceCapability,
  WorkspaceEnv,
  WslDistro,
} from "@termco/workspace-base";

function isSafeDistroName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  if (name === "." || name === ".." || name.startsWith(".") || name.includes("..")) {
    return false;
  }
  return [...name].every(
    (character) =>
      /[A-Za-z0-9]/.test(character) ||
      character === "." ||
      character === "_" ||
      character === "-" ||
      character === " ",
  );
}

function validateDistro(distro: string): void {
  if (!isSafeDistroName(distro)) throw new Error(`unsafe WSL distro name: ${distro}`);
}

function wslDrvfsToWindows(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  if (!normalized.startsWith("/mnt/")) return null;
  const rest = normalized.slice(5);
  const slash = rest.indexOf("/");
  const drive = slash < 0 ? rest : rest.slice(0, slash);
  if (drive.length !== 1 || !/[A-Za-z]/.test(drive)) return null;
  const suffix = (slash < 0 ? "" : rest.slice(slash + 1)).replace(/\//g, "\\");
  return `${drive.toUpperCase()}:\\${suffix}`;
}

function wslPathToUnc(distro: string, path: string): string {
  if (!isSafeDistroName(distro)) {
    return "\\\\wsl.localhost\\__termco_invalid_distro__";
  }
  const trimmed = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const suffix = trimmed.replace(/\//g, "\\");
  const primary = `\\\\wsl.localhost\\${distro}\\${suffix}`;
  return existsSync(primary) ? primary : `\\\\wsl$\\${distro}\\${suffix}`;
}

function looksUtf16le(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes.length % 2 !== 0) return false;
  let nullOdd = 0;
  for (let index = 1; index < bytes.length; index += 2) {
    if (bytes[index] === 0) nullOdd++;
  }
  return nullOdd * 2 >= bytes.length / 2;
}

function decodeOutput(bytes: Buffer): string {
  const hasBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  return hasBom || looksUtf16le(bytes)
    ? bytes.subarray(hasBom ? 2 : 0).toString("utf16le")
    : bytes.toString("utf8");
}

function parseDistroList(output: string): WslDistro[] {
  const result: WslDistro[] = [];
  for (const raw of output.split("\n").slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    const isDefault = line.startsWith("*");
    const parts = line.replace(/^\*/, "").trim().split(/\s+/);
    if (parts.length < 3) continue;
    const stateIndex = parts.length - 2;
    result.push({
      name: parts.slice(0, stateIndex).join(" "),
      default: isDefault,
      running: parts[stateIndex].toLocaleLowerCase() === "running",
    });
  }
  return result;
}

function runWsl(args: string[]): string {
  const result = spawnSync("wsl.exe", args, {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(decodeOutput(result.stderr ?? Buffer.alloc(0)).trim());
  return decodeOutput(result.stdout ?? Buffer.alloc(0));
}

function runWslShell(distro: string, script: string): string {
  validateDistro(distro);
  return runWsl(["-d", distro, "--exec", "sh", "-c", script]);
}

function launchDirectory(argv: string[]): string {
  for (const argument of argv.slice(2)) {
    if (argument.startsWith("-")) continue;
    try {
      const candidate = resolve(argument);
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Not a usable launch directory.
    }
  }
  return process.cwd();
}

export function createWorkspaceCapability(input: {
  platform: NodeJS.Platform;
  argv: string[];
  home?: string;
}): WorkspaceCapability {
  const roots = new Set<string>();
  const display = (path: string) => {
    if (input.platform !== "win32") return path;
    const withoutPrefix = path.startsWith("\\\\?\\UNC\\")
      ? `\\\\${path.slice("\\\\?\\UNC\\".length)}`
      : path.startsWith("\\\\?\\")
        ? path.slice("\\\\?\\".length)
        : path;
    return withoutPrefix.replace(/\\/g, "/");
  };
  const authorizeRoot = (path: string) => {
    const canonical = realpathSync(path);
    roots.add(canonical);
    return canonical;
  };
  const normalize = (workspace: WorkspaceEnv) => {
    if (workspace?.kind === "wsl") {
      return { kind: "wsl" as const, distro: workspace.distro };
    }
    if (workspace?.kind === "ssh") {
      return { kind: "ssh" as const, connectionId: workspace.connectionId };
    }
    return { kind: "local" as const };
  };
  const wslPathToHost = (distro: string, path: string) =>
    wslDrvfsToWindows(path) ?? wslPathToUnc(distro, path);
  const resolvePath = (path: string, workspace: WorkspaceEnv) => {
    const normalized = normalize(workspace);
    return normalized.kind === "wsl" && normalized.distro
      ? wslPathToHost(normalized.distro, path)
      : path;
  };
  const currentDir = launchDirectory(input.argv);
  const home = input.home ?? homedir();

  for (const initial of [currentDir, home]) {
    try {
      authorizeRoot(initial);
    } catch {
      // Stale launch/home paths do not prevent startup.
    }
  }

  return {
    authorize(path, workspace) {
      const resolved = resolvePath(path, workspace);
      if (workspace?.kind === "ssh") return resolved;
      try {
        return display(authorizeRoot(resolved));
      } catch {
        return display(resolved);
      }
    },
    authorizeRoot,
    isAuthorized(path) {
      for (const root of roots) {
        if (path === root || path.startsWith(`${root}${sep}`)) return true;
      }
      return false;
    },
    canonicalize: realpathSync,
    currentDir: () => display(authorizeRoot(currentDir)),
    homeDir: () => display(authorizeRoot(home)),
    resolvePath,
    normalize,
    toCanonicalDisplay: display,
    stripWindowsVerbatim: display,
    listWslDistros: () =>
      input.platform === "win32" ? parseDistroList(runWsl(["--list", "--verbose"])) : [],
    defaultWslDistro() {
      if (input.platform !== "win32") return null;
      const distros = parseDistroList(runWsl(["--list", "--verbose"]));
      return distros.find((distro) => distro.default)?.name ?? distros[0]?.name ?? null;
    },
    wslHome(distro) {
      if (input.platform !== "win32") throw new Error("WSL is only available on Windows");
      const value = runWslShell(distro, 'printf %s "$HOME"')
        .split("\n")
        .reverse()
        .map((line) => line.trim())
        .find(Boolean);
      if (!value) throw new Error(`could not resolve WSL home for ${distro}`);
      return value;
    },
    wslPathToHost,
  };
}

export const workspaceInternals = {
  isSafeDistroName,
  parseDistroList,
  decodeOutput,
};
