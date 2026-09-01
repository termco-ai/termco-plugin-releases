/**
 * Remote shell-integration for SSH terminals. Uploads Termco's rc scripts to the
 * remote (once per connection, cached) so the remote shell emits OSC 7 (cwd) and
 * OSC 133 (command blocks) — giving the SSH terminal the same folder-follows-cd
 * and block behavior as a local terminal. Only zsh/bash are wired (the common
 * cases); other shells fall back to a plain login shell.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { pluginAssetPath } from "./assets";
import { probeRemote } from "./probe";
import { ok, runScp, runSsh } from "./runner";
import type { SshTarget } from "./types";

export interface SshShellPrep {
  shellName: "zsh" | "bash" | "fish" | "other";
  /** Remote ZDOTDIR (zsh) or absolute rcfile path (bash); null = no integration. */
  integrationArg: string | null;
}

const REMOTE_DIR = ".termco-server/shell-integration";
const ZSH_FILES: [src: string, dest: string][] = [
  ["zshenv.zsh", ".zshenv"],
  ["zprofile.zsh", ".zprofile"],
  ["zshrc.zsh", ".zshrc"],
  ["zlogin.zsh", ".zlogin"],
];

const cache = new Map<string, Promise<SshShellPrep>>();

/** Ensure the rc scripts are on the remote; cached per connection. */
export function ensureShellIntegration(target: SshTarget): Promise<SshShellPrep> {
  let p = cache.get(target.connectionId);
  if (!p) {
    p = build(target).catch((e) => {
      cache.delete(target.connectionId);
      throw e;
    });
    cache.set(target.connectionId, p);
  }
  return p;
}

function classify(shellPath: string | null): SshShellPrep["shellName"] {
  const b = shellPath ? basename(shellPath) : "";
  if (b === "zsh") return "zsh";
  if (b === "bash") return "bash";
  if (b === "fish") return "fish";
  return "other";
}

async function build(target: SshTarget): Promise<SshShellPrep> {
  const probe = await probeRemote(target);
  const shellName = classify(probe.shell);
  const remoteDir = `${probe.home}/${REMOTE_DIR}`;

  const mk = await runSsh(target, `mkdir -p '${remoteDir}'`);
  if (!ok(mk)) return { shellName, integrationArg: null };

  if (shellName === "zsh") {
    for (const [src, dest] of ZSH_FILES) {
      const local = pluginAssetPath("shell-integration", src);
      if (existsSync(local)) await runScp(target, local, `${REMOTE_DIR}/${dest}`);
    }
    return { shellName, integrationArg: remoteDir };
  }
  if (shellName === "bash") {
    const local = pluginAssetPath("shell-integration", "bashrc.bash");
    if (existsSync(local)) await runScp(target, local, `${REMOTE_DIR}/bashrc`);
    return { shellName, integrationArg: `${remoteDir}/bashrc` };
  }
  return { shellName, integrationArg: null };
}
