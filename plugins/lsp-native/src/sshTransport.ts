/**
 * SSH transport: spawn a language server on the remote host through the node
 * agent and proxy its stdio over the persistent ssh RPC (base64 chunks with
 * per-write acks as application-level backpressure). All protocol intelligence
 * stays in the main-process client — the agent is a byte pipe.
 *
 * Remote launch resolution ladder: managed install under ~/.termco-server/lsp
 * (auto-installing on first need via the agent's own pinned Node+npm) → remote
 * PATH via `lsp.which` → custom commands verbatim.
 */
import { PassThrough, Writable } from "node:stream";
import type { WorkspaceEnv, WorkspaceExecutionChannel } from "@termco/workspace-base";
import { MissingServerError } from "./sessions";
import { lspRuntime } from "./runtime";
import type { LspTransport } from "./transport";
import { substituteLaunchArgs, type LspServerConfig } from "./types";

const WRITE_CHUNK = 64 * 1024;

type RemoteLaunch = { command: string | null; args: string[] };

/** Resolve how to start this server on the remote host. `${root}` in args is
 * substituted with the REMOTE project root. */
async function resolveRemoteLaunch(
  channel: WorkspaceExecutionChannel,
  config: LspServerConfig,
  progressChannel: number,
  root: string,
): Promise<RemoteLaunch> {
  const auto = config.autoInstall;
  const substitute = (serverModules?: string) =>
    substituteLaunchArgs(config.args, { root, serverModules });
  if (auto) {
    const installed = await channel.call<{
      ok: boolean;
      binJs?: string;
      error?: string;
    }>("lsp.install", {
      npmPackage: auto.npmPackage,
      version: auto.version,
      extraPackages: auto.extraPackages,
      bin: auto.bin,
      channel: progressChannel,
    });
    if (installed.ok && installed.binJs) {
      const modulesAt = installed.binJs.indexOf("/node_modules/");
      const serverModules =
        modulesAt >= 0
          ? installed.binJs.slice(0, modulesAt + "/node_modules".length)
          : undefined;
      // null command → the agent's own pinned Node.
      return {
        command: null,
        args: [installed.binJs, ...substitute(serverModules)],
      };
    }
  }
  const which = await channel.call<{
    found: Record<string, string | null>;
  }>("lsp.which", { bins: [config.command] });
  const onPath = which.found[config.command];
  if (onPath) return { command: onPath, args: substitute() };
  if (config.custom || config.command.includes("/")) {
    return { command: config.command, args: substitute() };
  }
  throw new MissingServerError(`${config.command} (remote)`);
}

export async function spawnSshTransport(
  ws: WorkspaceEnv,
  config: LspServerConfig,
  root: string,
): Promise<LspTransport> {
  const { execution } = lspRuntime();
  const reader = new PassThrough();
  let stderrTail = "";
  let handle: number | null = null;
  let exited = false;
  const exitCbs: Array<(code: number | null) => void> = [];
  const fireExit = (code: number | null) => {
    if (exited) return;
    exited = true;
    reader.push(null);
    for (const cb of exitCbs) cb(code);
  };

  const channel = await execution.openChannel(ws, (event, data) => {
    const payload = data as {
      chunkB64?: string;
      code?: number | null;
      message?: string;
      error?: string;
    };
    switch (event) {
      case "data":
        if (payload.chunkB64) reader.push(Buffer.from(payload.chunkB64, "base64"));
        break;
      case "stderr":
        if (payload.chunkB64) {
          stderrTail = (
          stderrTail + Buffer.from(payload.chunkB64, "base64").toString("utf8")
          ).slice(-2000);
        }
        break;
      case "progress":
        break; // install progress piggybacks on the same channel
      case "exit":
        channel.close();
        fireExit(payload.code ?? null);
        break;
      case "closed":
        // The ssh connection itself died.
        stderrTail = `${stderrTail} — ssh connection closed`.slice(-2000);
        fireExit(null);
        break;
    }
  });

  let launch: RemoteLaunch;
  try {
    launch = await resolveRemoteLaunch(channel, config, channel.id, root);
    const spawned = await channel.call<{ handle: number }>("lsp.spawn", {
      command: launch.command,
      args: launch.args,
      cwd: root,
      channel: channel.id,
    });
    handle = spawned.handle;
  } catch (e) {
    channel.close();
    fireExit(null);
    throw e;
  }

  // Sequential 64 KB acked chunks: each write round-trips before the next, a
  // simple application-level backpressure window over the unbounded ssh pipe.
  const writer = new Writable({
    write(chunk: Buffer, _encoding, cb) {
      void (async () => {
        try {
          for (let at = 0; at < chunk.length; at += WRITE_CHUNK) {
            if (exited || handle == null) break;
            await channel.call("lsp.write", {
              handle,
              chunkB64: chunk.subarray(at, at + WRITE_CHUNK).toString("base64"),
            });
          }
          cb();
        } catch {
          cb(); // dying transport — exit handling surfaces the failure
        }
      })();
    },
  });

  return {
    reader,
    writer,
    kill: () => {
      if (handle != null) {
        void channel.call("lsp.kill", { handle }).catch(() => {});
      }
    },
    onExit: (cb) => {
      if (exited) cb(null);
      else exitCbs.push(cb);
    },
    stderrTail: () => stderrTail,
  };
}

/** Marker probe on the remote — null when nothing matched (used for the
 * projectMarkers activation check, where a fallback would be wrong). */
export async function sshLspProbeRoot(
  ws: WorkspaceEnv,
  path: string,
  markers: string[],
  rigRoot: string | null,
): Promise<string | null> {
  try {
    const result = await lspRuntime().execution.invoke<{ root: string | null }>(ws, {
      domain: "lsp",
      method: "findRoot",
      args: [{ path, markers, stopAt: rigRoot }],
    });
    return result.root;
  } catch {
    return null;
  }
}

/** Root detection on the remote — one RPC instead of N stat round trips. */
export async function sshLspFindRoot(
  ws: WorkspaceEnv,
  path: string,
  markers: string[],
  rigRoot: string | null,
): Promise<string> {
  try {
    const result = await lspRuntime().execution.invoke<{ root: string | null }>(ws, {
      domain: "lsp",
      method: "findRoot",
      args: [{ path, markers, stopAt: rigRoot }],
    });
    if (result.root) return result.root;
  } catch {
    // fall through to the static fallback
  }
  return rigRoot ?? path.slice(0, path.lastIndexOf("/")) ?? "/";
}
