/**
 * One-shot remote probe: resolve $HOME, uname (os/arch), libc (musl?), and any
 * pre-installed `node` — everything the connection layer needs BEFORE the server
 * exists. Agent-free, so the terminal and rig creation work even on a host
 * without Node.
 *
 * Robustness: the script is one argv element (ssh sends it verbatim to the
 * remote shell — no nested `sh -c` mis-parse), and every value is emitted on a
 * `TC<KEY>=…` marker line so login banners / MOTD noise on stdout can't shift the
 * parse. Non-login shell (`-l` isn't portable to dash); a missing `node` is not
 * fatal — we bootstrap our own.
 */
import { REMOTE_PATH_PRELUDE } from "./pathPrelude";
import { ok, runSsh } from "./runner";
import type { SshTarget } from "./types";

export interface RemoteProbe {
  home: string;
  /** `uname -s`, e.g. "Linux" | "Darwin". */
  unameS: string;
  /** `uname -m`, e.g. "x86_64" | "aarch64" | "arm64". */
  unameM: string;
  nodePath: string | null;
  nodeVersion: string | null;
  /** True on Alpine / musl libc. */
  musl: boolean;
  /** The user's login shell path ($SHELL), for terminal shell-integration. */
  shell: string | null;
}

const PROBE_SCRIPT = [
  // Widen PATH first so a user-local node (nvm, ~/.local/bin) is discovered —
  // the sshd minimal PATH hides those (same fix as the coding-agent probe).
  REMOTE_PATH_PRELUDE.replace(/; $/, ""),
  'H="$HOME"',
  '[ -n "$H" ] || H="$(cd 2>/dev/null && pwd)"',
  `printf 'TCHOME=%s\\n' "$H"`,
  `printf 'TCUNAME=%s|%s\\n' "$(uname -s 2>/dev/null)" "$(uname -m 2>/dev/null)"`,
  `printf 'TCSHELL=%s\\n' "$SHELL"`,
  'if command -v node >/dev/null 2>&1; then ' +
    `printf 'TCNODE=%s\\n' "$(command -v node)"; ` +
    `printf 'TCNODEV=%s\\n' "$(node -v 2>/dev/null)"; fi`,
  `[ -f /etc/alpine-release ] && printf 'TCMUSL=1\\n'`,
  "true",
].join("; ");

/** Pure parser (exported for tests): pull `TC<KEY>=` marker lines from stdout. */
export function parseProbe(stdout: string): RemoteProbe {
  const grab = (prefix: string): string | null => {
    for (const raw of stdout.split("\n")) {
      const line = raw.trim();
      if (line.startsWith(prefix)) return line.slice(prefix.length);
    }
    return null;
  };
  const [unameS = "", unameM = ""] = (grab("TCUNAME=") ?? "").split("|");
  return {
    home: grab("TCHOME=") ?? "",
    unameS,
    unameM,
    nodePath: grab("TCNODE=") || null,
    nodeVersion: grab("TCNODEV=") || null,
    musl: grab("TCMUSL=") === "1",
    shell: grab("TCSHELL=") || null,
  };
}

export async function probeRemote(target: SshTarget): Promise<RemoteProbe> {
  const out = await runSsh(target, PROBE_SCRIPT);
  if (out.spawnError) throw new Error("ssh is not installed or not on PATH");
  if (!ok(out)) {
    throw new Error(out.stderr.trim() || `ssh connection to ${target.connectionId} failed`);
  }
  const probe = parseProbe(out.stdout);
  if (!probe.home) throw new Error("could not resolve remote $HOME");
  return probe;
}

/** Resolve just the remote $HOME (agent-free) — used by ssh_home / rig creation. */
export async function resolveHome(target: SshTarget): Promise<string> {
  return (await probeRemote(target)).home;
}
