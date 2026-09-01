import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join, posix, win32 } from "node:path";

type SearchPathOptions = {
  basePath: string;
  loginShellPath: string;
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  versionManagerDirs?: string[];
};

type FindOptions = {
  platform: NodeJS.Platform;
  exists: (candidate: string) => boolean;
  pathExt?: string;
};

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

function joinForPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  return platform === "win32" ? win32.join(...parts) : posix.join(...parts);
}

function splitPath(value: string, platform: NodeJS.Platform): string[] {
  return value.split(pathDelimiter(platform)).map((entry) => entry.trim()).filter(Boolean);
}

function addDirectory(target: string[], seen: Set<string>, directory?: string | null): void {
  if (!directory) return;
  const normalized = directory.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push(normalized);
}

/**
 * Build the PATH used for local coding-agent discovery and spawning. Login-shell
 * entries lead because they represent what the user's terminal sees; known
 * native, npm, and version-manager locations cover GUI apps whose shell startup
 * is unavailable or times out.
 */
export function buildLocalExecutablePath(options: SearchPathOptions): string {
  const { basePath, loginShellPath, home, platform, env } = options;
  const directories: string[] = [];
  const seen = new Set<string>();
  for (const directory of splitPath(loginShellPath, platform)) addDirectory(directories, seen, directory);
  for (const directory of splitPath(basePath, platform)) addDirectory(directories, seen, directory);

  if (platform === "win32") {
    const appData = env.APPDATA;
    const localAppData = env.LOCALAPPDATA;
    const programData = env.ProgramData ?? env.PROGRAMDATA;
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".claude", "local"));
    addDirectory(directories, seen, appData && joinForPlatform(platform, appData, "npm"));
    addDirectory(directories, seen, localAppData && joinForPlatform(platform, localAppData, "pnpm"));
    addDirectory(directories, seen, localAppData && joinForPlatform(platform, localAppData, "Microsoft", "WinGet", "Links"));
    addDirectory(directories, seen, localAppData && joinForPlatform(platform, localAppData, "Programs", "claude"));
    addDirectory(directories, seen, joinForPlatform(platform, home, "scoop", "shims"));
    addDirectory(directories, seen, programData && joinForPlatform(platform, programData, "chocolatey", "bin"));
    addDirectory(directories, seen, env.PNPM_HOME);
    addDirectory(directories, seen, env.NVM_SYMLINK);
    addDirectory(directories, seen, env.NVM_HOME);
    addDirectory(directories, seen, env.VOLTA_HOME && joinForPlatform(platform, env.VOLTA_HOME, "bin"));
  } else {
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".claude", "local"));
    addDirectory(directories, seen, joinForPlatform(platform, home, "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".npm-global", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".bun", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".volta", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".asdf", "shims"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "share", "mise", "shims"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "share", "pnpm"));
    addDirectory(directories, seen, env.PNPM_HOME);
    addDirectory(directories, seen, env.VOLTA_HOME && joinForPlatform(platform, env.VOLTA_HOME, "bin"));
    addDirectory(directories, seen, env.BUN_INSTALL && joinForPlatform(platform, env.BUN_INSTALL, "bin"));
    addDirectory(directories, seen, env.NPM_CONFIG_PREFIX && joinForPlatform(platform, env.NPM_CONFIG_PREFIX, "bin"));
    for (const directory of options.versionManagerDirs ?? []) addDirectory(directories, seen, directory);
    addDirectory(directories, seen, "/opt/homebrew/bin");
    addDirectory(directories, seen, "/usr/local/bin");
    addDirectory(directories, seen, "/opt/local/bin");
    addDirectory(directories, seen, "/home/linuxbrew/.linuxbrew/bin");
    addDirectory(directories, seen, "/snap/bin");
  }
  return directories.join(pathDelimiter(platform));
}

export function findExecutableOnPath(bin: string, searchPath: string, options: FindOptions): string | null {
  if (isAbsolute(bin)) return options.exists(bin) ? bin : null;
  const extensions = options.platform === "win32"
    ? (options.pathExt || ".EXE;.CMD;.BAT;.COM").split(";").map((extension) => extension.toLowerCase())
    : [""];
  for (const directory of splitPath(searchPath, options.platform)) {
    for (const extension of extensions) {
      const candidate = joinForPlatform(options.platform, directory, bin.toLowerCase().endsWith(extension) ? bin : `${bin}${extension}`);
      if (options.exists(candidate)) return candidate;
    }
  }
  return null;
}

function executableExists(candidate: string): boolean {
  try {
    if (!existsSync(candidate) || !statSync(candidate).isFile()) return false;
    if (process.platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function childBinDirectories(root: string, suffix: string[]): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, ...suffix));
  } catch {
    return [];
  }
}

function versionManagerDirectories(home: string): string[] {
  return [
    ...childBinDirectories(join(home, ".nvm", "versions", "node"), ["bin"]),
    ...childBinDirectories(join(home, ".fnm", "node-versions"), ["installation", "bin"]),
    ...childBinDirectories(join(home, ".local", "share", "mise", "installs", "node"), ["bin"]),
  ].reverse();
}

let pathPromise: Promise<string> | null = null;
let resolvedPath: string | null = null;
const executableCache = new Map<string, string | null>();

function loginShell(): string | undefined {
  try {
    return userInfo().shell || process.env.SHELL || undefined;
  } catch {
    return process.env.SHELL || undefined;
  }
}

function readLoginShellPath(shell: string): Promise<string> {
  return new Promise((resolve) => {
    const child = execFile(shell, ["-l", "-c", "printf '%s\\n' \"$PATH\""], { timeout: 3_000 }, (error, stdout) => {
      const lastLine = stdout?.trim().split("\n").pop() ?? "";
      resolve(error ? "" : lastLine);
    });
    child.on("error", () => resolve(""));
  });
}

export function localExecutablePath(): Promise<string> {
  if (pathPromise) return pathPromise;
  pathPromise = (async () => {
    const home = homedir();
    const shell = process.platform === "win32" ? undefined : loginShell();
    const loginPath = shell ? await readLoginShellPath(shell) : "";
    resolvedPath = buildLocalExecutablePath({
      basePath: process.env.PATH ?? "",
      loginShellPath: loginPath,
      home,
      platform: process.platform,
      env: process.env,
      versionManagerDirs: process.platform === "win32" ? [] : versionManagerDirectories(home),
    });
    return resolvedPath;
  })();
  return pathPromise;
}

export async function resolveLocalExecutable(bin: string): Promise<string | null> {
  if (executableCache.has(bin)) return executableCache.get(bin) ?? null;
  const searchPath = await localExecutablePath();
  const resolved = findExecutableOnPath(bin, searchPath, {
    platform: process.platform,
    exists: executableExists,
    pathExt: process.env.PATHEXT,
  });
  executableCache.set(bin, resolved);
  return resolved;
}

/** Synchronous spawn environment after the availability probe has primed PATH. */
export function localExecutableEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const path = resolvedPath ?? buildLocalExecutablePath({
    basePath: base.PATH ?? process.env.PATH ?? "",
    loginShellPath: "",
    home: homedir(),
    platform: process.platform,
    env: { ...process.env, ...base },
    versionManagerDirs: process.platform === "win32" ? [] : versionManagerDirectories(homedir()),
  });
  return { ...base, PATH: path };
}

export function clearLocalExecutableCache(bin?: string): void {
  if (bin) executableCache.delete(bin);
  else executableCache.clear();
}
