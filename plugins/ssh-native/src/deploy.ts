/**
 * Server bootstrap — install the Termco Server bundle + a usable Node on the
 * remote and return how to launch it. Version-pinned dir + idempotent reuse
 * (cheap existence check on reconnect), à la VS Code's ~/.vscode-server/bin.
 *
 * Every remote command is a SINGLE argv string (see runner.ts header).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pluginAssetPath } from "./assets";
import { ensureRemoteNode } from "./nodeBootstrap";
import { probeRemote } from "./probe";
import { ok, runScp, runSsh } from "./runner";
import type { SshTarget } from "./types";

export const SERVER_VERSION = "0.1.0";
const SERVER_BUNDLE = "termco-server.mjs";

export interface ServerLaunch {
  /** Absolute remote node path (pre-installed or bootstrapped). */
  nodePath: string;
  /** Absolute remote path to the server bundle. */
  serverPath: string;
  /** Remote $HOME (default rig root). */
  home: string;
}

export async function ensureServer(target: SshTarget): Promise<ServerLaunch> {
  const probe = await probeRemote(target);
  const home = probe.home;
  const nodePath = await ensureRemoteNode(target, probe);

  const remoteDir = `.termco-server/${SERVER_VERSION}`;
  const relServer = `${remoteDir}/${SERVER_BUNDLE}`;
  const serverPath = `${home}/${relServer}`;

  const localServer = pluginAssetPath("server", SERVER_BUNDLE);
  if (!existsSync(localServer)) {
    throw new Error(`server bundle missing at ${localServer} — run \`pnpm build:server\``);
  }
  // Async read: this runs on ssh connect (rig switch to an ssh host) on the
  // main thread — no reason to block it on disk IO.
  const localHash = createHash("sha256")
    .update(await readFile(localServer))
    .digest("hex");

  // Re-upload whenever the bundle CONTENT changed (compared via a `.sha` marker),
  // not merely when it's absent — so a rebuilt server deploys without a version
  // bump. The large node runtime stays cached separately (nodeBootstrap).
  const shaCheck = await runSsh(target, `cat '${serverPath}.sha' 2>/dev/null`);
  if (ok(shaCheck) && shaCheck.stdout.trim() === localHash) {
    return { nodePath, serverPath, home };
  }

  const mk = await runSsh(target, `mkdir -p '${home}/${remoteDir}' && chmod 700 '${home}/.termco-server'`);
  if (!ok(mk)) throw new Error(mk.stderr.trim() || "could not create remote server dir");
  const up = await runScp(target, localServer, relServer, 60);
  if (!ok(up)) throw new Error(up.stderr.trim() || "server upload failed");
  await runSsh(target, `printf %s '${localHash}' > '${serverPath}.sha'`);

  return { nodePath, serverPath, home };
}
