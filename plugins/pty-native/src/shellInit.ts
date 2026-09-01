/**
 * Shell launch + OSC 7/133 integration (unix path).
 *
 * Resolves the shell, injects Termco's rc scripts (zsh ZDOTDIR / bash --rcfile /
 * fish conf.d), and builds the { file, args, env, cwd } node-pty spawn spec.
 * Windows/pwsh + WSL land in M7.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const IS_WINDOWS = process.platform === "win32";

function whichInPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** pwsh → PowerShell 7 → Windows PowerShell → cmd (mirrors windows_shell_path). */
function windowsShellPath(): string {
  const pwsh = whichInPath("pwsh.exe");
  if (pwsh) return pwsh;
  const pf = process.env.ProgramFiles;
  if (pf) {
    const c = join(pf, "PowerShell", "7", "pwsh.exe");
    if (existsSync(c)) return c;
  }
  const sysRoot = process.env.SystemRoot ?? "C:\\Windows";
  const ps5 = join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (existsSync(ps5)) return ps5;
  return join(sysRoot, "System32", "cmd.exe");
}

export interface ShellInfo {
  name: string;
  path: string;
  integrated: boolean;
}

export interface SpawnSpec {
  file: string;
  args: string[];
  env: Record<string, string>;
  cwd: string | undefined;
}

const FISH_REINSTALL_PROMPT =
  "functions -q __termco_install_prompt; and __termco_install_prompt";

type ShellKind = "zsh" | "bash" | "fish" | "other";

function classify(path: string): ShellKind {
  const name = basename(path);
  if (name === "zsh") return "zsh";
  if (name === "bash") return "bash";
  if (name === "fish") return "fish";
  return "other";
}

function loginShell(): string | undefined {
  try {
    const shell = userInfo().shell;
    if (shell) return shell;
  } catch {
    // no passwd entry
  }
  return process.env.SHELL || undefined;
}

function detect(): { kind: ShellKind; path: string } {
  const path = loginShell() || "/bin/zsh";
  return { kind: classify(path), path };
}

function resolveShell(override?: string | null): { kind: ShellKind; path: string } {
  const trimmed = override?.trim();
  if (trimmed && existsSync(trimmed) && statSync(trimmed).isFile()) {
    return { kind: classify(trimmed), path: trimmed };
  }
  return detect();
}

export function detectShellName(): string {
  if (IS_WINDOWS) return basename(windowsShellPath()).replace(/\.exe$/i, "").toLowerCase();
  return basename(detect().path);
}

export function listShells(): ShellInfo[] {
  if (IS_WINDOWS) {
    const sysRoot = process.env.SystemRoot ?? "C:\\Windows";
    const candidates = [
      whichInPath("pwsh.exe"),
      join(sysRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      join(sysRoot, "System32", "cmd.exe"),
    ].filter((p): p is string => !!p && existsSync(p));
    const seen = new Set<string>();
    return candidates
      .filter((p) => !seen.has(p) && seen.add(p))
      .map((p) => ({ name: basename(p), path: p, integrated: /pwsh|powershell/i.test(p) }));
  }
  const out: ShellInfo[] = [];
  const seen = new Set<string>();
  const candidates = [detect().path];
  try {
    const etc = readFileSync("/etc/shells", "utf8");
    for (const raw of etc.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      candidates.push(line);
    }
  } catch {
    // /etc/shells absent
  }
  for (const path of candidates) {
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    out.push({
      name: basename(path),
      path,
      integrated: classify(path) !== "other",
    });
  }
  return out;
}

// Honor the shell override only if it matches an enumerated shell (a tampered
// setting can't spawn an arbitrary bin).
function sanitizeOverride(shell?: string | null): string | undefined {
  const candidate = shell?.trim();
  if (!candidate) return undefined;
  const allowed = listShells().some((s) => s.path === candidate);
  return allowed ? candidate : undefined;
}

function isUtf8(v: string): boolean {
  const up = v.toUpperCase();
  return up.includes("UTF-8") || up.includes("UTF8");
}

function applyCommon(
  env: Record<string, string>,
  cwd: string | undefined,
  blocks: boolean,
): string | undefined {
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERMCO_TERMINAL = "1";
  if (blocks) env.TERMCO_BLOCKS = "1";

  const alreadyUtf8 = ["LC_ALL", "LC_CTYPE", "LANG"].some((k) => {
    const v = process.env[k];
    return v != null && isUtf8(v);
  });
  if (!alreadyUtf8) {
    env.LANG = process.platform === "linux" ? "C.UTF-8" : "en_US.UTF-8";
  }

  const usable = (p: string | undefined): p is string => {
    if (!p) return false;
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const resolved = [cwd, homedir()].find(usable);
  return resolved;
}

function writeIfChanged(path: string, content: string): void {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch {
    // missing → write
  }
  const tmp = `${path}.__termco_tmp__`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

function integrationRoot(): string {
  const root = join(homedir(), ".cache", "termco", "shell-integration");
  mkdirSync(root, { recursive: true });
  return root;
}

function script(name: string): string {
  const compiled = fileURLToPath(
    new URL(`./assets/shell-integration/${name}`, import.meta.url),
  );
  const source = fileURLToPath(
    new URL(`../assets/shell-integration/${name}`, import.meta.url),
  );
  return readFileSync(existsSync(compiled) ? compiled : source, "utf8");
}

function prepareZdotdir(): string {
  const dir = join(integrationRoot(), "zsh");
  mkdirSync(dir, { recursive: true });
  writeIfChanged(join(dir, ".zshenv"), script("zshenv.zsh"));
  writeIfChanged(join(dir, ".zprofile"), script("zprofile.zsh"));
  writeIfChanged(join(dir, ".zshrc"), script("zshrc.zsh"));
  writeIfChanged(join(dir, ".zlogin"), script("zlogin.zsh"));
  return dir;
}

function prepareBashRc(): string {
  const dir = join(integrationRoot(), "bash");
  mkdirSync(dir, { recursive: true });
  const rc = join(dir, "bashrc");
  writeIfChanged(rc, script("bashrc.bash"));
  return rc;
}

function prepareFishConfD(): void {
  const dir = join(homedir(), ".config", "fish", "conf.d");
  mkdirSync(dir, { recursive: true });
  writeIfChanged(join(dir, "termco.fish"), script("init.fish"));
}

/**
 * Spawn spec for an SSH workspace terminal: run the `ssh` client locally under
 * node-pty and let **sshd allocate the remote PTY** (`-tt`) — a real remote
 * terminal with the entire renderer/DaFilter/AgentDetector byte pipeline reused
 * unchanged. Auth is interactive (no BatchMode) so a key passphrase/password
 * prompt shows up right in the terminal. When the rig has a remote root we
 * `cd` into it before the remote login shell.
 *
 * (Remote OSC-133 block integration + a server-owned persistent pty host are a
 * follow-up; a plain remote login shell is fully functional now.)
 */
export interface SshSpawnPrep {
  shellName: "zsh" | "bash" | "fish" | "other";
  /** Remote ZDOTDIR (zsh) or rcfile path (bash); null = plain login shell. */
  integrationArg: string | null;
}

export function buildSshSpawn(
  target: { host: string; user?: string; port?: number },
  cwd?: string | null,
  blocks?: boolean,
  prep?: SshSpawnPrep,
): SpawnSpec {
  const dest = target.user ? `${target.user}@${target.host}` : target.host;
  const args = ["-tt", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30"];
  if (target.port) args.push("-p", String(target.port));
  args.push(dest);

  // Remote command: cd into the rig root, inject Termco's shell-integration so
  // the remote shell emits OSC 7 (cwd → folder view follows `cd`) and OSC 133
  // (blocks), then hand off to the interactive shell.
  //
  // TERMCO_BLOCKS must match the app's block mode: when set, the rc scripts
  // REPLACE PS1 with just markers (no visible prompt) and the app renders block
  // headers; when unset, the normal `user@host:cwd` prompt shows. Hardcoding it
  // on for a non-block terminal blanks the prompt.
  const parts: string[] = [];
  if (cwd && cwd.trim()) parts.push(`cd '${cwd.replace(/'/g, `'\\''`)}' 2>/dev/null`);
  parts.push("export TERMCO_TERMINAL=1");
  if (blocks) parts.push("export TERMCO_BLOCKS=1");
  if (prep?.shellName === "zsh" && prep.integrationArg) {
    parts.push(`export TERMCO_USER_ZDOTDIR="\${ZDOTDIR:-$HOME}"`);
    parts.push(`export ZDOTDIR='${prep.integrationArg}'`);
    parts.push("exec zsh -l");
  } else if (prep?.shellName === "bash" && prep.integrationArg) {
    parts.push(`exec bash --rcfile '${prep.integrationArg}' -i`);
  } else {
    parts.push('exec "$SHELL" -l');
  }
  args.push(parts.join("; "));

  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return { file: "ssh", args, env, cwd: undefined };
}

export function buildSpawn(
  cwd: string | undefined,
  blocks: boolean,
  shellOverride?: string | null,
): SpawnSpec {
  if (IS_WINDOWS) {
    const override = sanitizeOverride(shellOverride);
    const file = override && existsSync(override) ? override : windowsShellPath();
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    const resolvedCwd = applyCommon(env, cwd, blocks);
    // Basic interactive launch; deep pwsh profile OSC-133 integration is a
    // follow-up (block mode falls back to a plain prompt on Windows for now).
    const args = /pwsh|powershell/i.test(file) ? ["-NoLogo"] : [];
    return { file, args, env, cwd: resolvedCwd };
  }

  const { kind, path } = resolveShell(sanitizeOverride(shellOverride));
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const resolvedCwd = applyCommon(env, cwd, blocks);
  const args: string[] = [];

  switch (kind) {
    case "zsh": {
      try {
        const zdotdir = prepareZdotdir();
        const userZd = process.env.ZDOTDIR;
        if (userZd && userZd !== zdotdir) env.TERMCO_USER_ZDOTDIR = userZd;
        env.ZDOTDIR = zdotdir;
      } catch (e) {
        console.warn("zsh shell integration disabled:", e);
      }
      args.push("-l");
      break;
    }
    case "bash": {
      try {
        args.push("--rcfile", prepareBashRc());
      } catch (e) {
        console.warn("bash shell integration disabled:", e);
      }
      args.push("-i");
      break;
    }
    case "fish": {
      try {
        prepareFishConfD();
      } catch (e) {
        console.warn("fish shell integration disabled:", e);
      }
      env.fish_features = "no-mark-prompt";
      args.push("-i", "-C", FISH_REINSTALL_PROMPT);
      break;
    }
    case "other":
      break;
  }

  return { file: path, args, env, cwd: resolvedCwd };
}
