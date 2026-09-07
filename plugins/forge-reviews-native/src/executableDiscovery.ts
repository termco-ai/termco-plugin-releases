import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { isAbsolute, posix, win32 } from "node:path";

type SearchPathOptions = {
  basePath: string;
  loginShellPath: string;
  home: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
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
  return value
    .split(pathDelimiter(platform))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function addDirectory(target: string[], seen: Set<string>, directory?: string | null): void {
  if (!directory) return;
  const normalized = directory.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push(normalized);
}

/**
 * Build the PATH used to discover forge CLIs. Electron apps commonly inherit a
 * much smaller PATH than the user's terminal, so login-shell and known native
 * package-manager locations are searched explicitly.
 */
export function buildForgeExecutablePath(options: SearchPathOptions): string {
  const { basePath, loginShellPath, home, platform, env } = options;
  const directories: string[] = [];
  const seen = new Set<string>();
  for (const directory of splitPath(loginShellPath, platform))
    addDirectory(directories, seen, directory);
  for (const directory of splitPath(basePath, platform)) addDirectory(directories, seen, directory);

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    const programData = env.ProgramData ?? env.PROGRAMDATA;
    const programFiles = env.ProgramFiles ?? env.PROGRAMFILES;
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "bin"));
    addDirectory(
      directories,
      seen,
      env.MISE_DATA_DIR && joinForPlatform(platform, env.MISE_DATA_DIR, "shims"),
    );
    addDirectory(
      directories,
      seen,
      localAppData && joinForPlatform(platform, localAppData, "Microsoft", "WinGet", "Links"),
    );
    addDirectory(
      directories,
      seen,
      localAppData && joinForPlatform(platform, localAppData, "Programs", "GitHub CLI"),
    );
    addDirectory(
      directories,
      seen,
      programFiles && joinForPlatform(platform, programFiles, "GitHub CLI"),
    );
    addDirectory(directories, seen, joinForPlatform(platform, home, "scoop", "shims"));
    addDirectory(
      directories,
      seen,
      programData && joinForPlatform(platform, programData, "chocolatey", "bin"),
    );
  } else {
    addDirectory(directories, seen, joinForPlatform(platform, home, ".local", "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, "bin"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".asdf", "shims"));
    addDirectory(
      directories,
      seen,
      joinForPlatform(platform, home, ".local", "share", "mise", "shims"),
    );
    addDirectory(
      directories,
      seen,
      env.MISE_DATA_DIR && joinForPlatform(platform, env.MISE_DATA_DIR, "shims"),
    );
    addDirectory(
      directories,
      seen,
      joinForPlatform(platform, home, ".local", "share", "aquaproj-aqua", "bin"),
    );
    addDirectory(directories, seen, joinForPlatform(platform, home, ".proto", "shims"));
    addDirectory(directories, seen, joinForPlatform(platform, home, ".nix-profile", "bin"));
    addDirectory(directories, seen, "/opt/homebrew/bin");
    addDirectory(directories, seen, "/usr/local/bin");
    addDirectory(directories, seen, "/usr/bin");
    addDirectory(directories, seen, "/bin");
    addDirectory(directories, seen, "/opt/local/bin");
    addDirectory(directories, seen, "/home/linuxbrew/.linuxbrew/bin");
    addDirectory(directories, seen, joinForPlatform(platform, home, ".linuxbrew", "bin"));
    addDirectory(directories, seen, "/snap/bin");
    addDirectory(directories, seen, "/nix/var/nix/profiles/default/bin");
  }
  return directories.join(pathDelimiter(platform));
}

export function findForgeExecutableOnPath(
  bin: string,
  searchPath: string,
  options: FindOptions,
): string | null {
  if (isAbsolute(bin)) return options.exists(bin) ? bin : null;
  const extensions =
    options.platform === "win32"
      ? (options.pathExt || ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .map((extension) => extension.toLowerCase())
      : [""];
  for (const directory of splitPath(searchPath, options.platform)) {
    for (const extension of extensions) {
      const candidate = joinForPlatform(
        options.platform,
        directory,
        bin.toLowerCase().endsWith(extension) ? bin : `${bin}${extension}`,
      );
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
    const child = execFile(
      shell,
      ["-l", "-c", "printf '%s\\n' \"$PATH\""],
      { timeout: 3_000 },
      (error, stdout) => resolve(error ? "" : (stdout?.trim().split("\n").pop() ?? "")),
    );
    child.on("error", () => resolve(""));
  });
}

export function forgeExecutablePath(): Promise<string> {
  if (pathPromise) return pathPromise;
  pathPromise = (async () => {
    const home = homedir();
    const shell = process.platform === "win32" ? undefined : loginShell();
    const loginPath = shell ? await readLoginShellPath(shell) : "";
    resolvedPath = buildForgeExecutablePath({
      basePath: process.env.PATH ?? "",
      loginShellPath: loginPath,
      home,
      platform: process.platform,
      env: process.env,
    });
    return resolvedPath;
  })();
  return pathPromise;
}

export async function resolveForgeExecutable(bin: string): Promise<string | null> {
  if (executableCache.has(bin)) return executableCache.get(bin) ?? null;
  const searchPath = await forgeExecutablePath();
  const resolved = findForgeExecutableOnPath(bin, searchPath, {
    platform: process.platform,
    exists: executableExists,
    pathExt: process.env.PATHEXT,
  });
  executableCache.set(bin, resolved);
  return resolved;
}

export function forgeExecutableEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const path =
    resolvedPath ??
    buildForgeExecutablePath({
      basePath: base.PATH ?? process.env.PATH ?? "",
      loginShellPath: "",
      home: homedir(),
      platform: process.platform,
      env: { ...process.env, ...base },
    });
  return { ...base, PATH: path };
}

export function clearForgeExecutableCache(bin?: string): void {
  if (bin) {
    executableCache.delete(bin);
    return;
  }
  executableCache.clear();
  pathPromise = null;
  resolvedPath = null;
}
