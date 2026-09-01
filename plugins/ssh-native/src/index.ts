/**
 * Shared SSH capability support. Host listing and home resolution are
 * agent-free plain-SSH probes, so creating a rig and terminal never depends on
 * the remote server. Connection and server lifecycle state stays in this
 * selected provider.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { app } from "electron";
import { emit } from "./events";
import { type ClientStateHub, createClientStateHub } from "./stateHub";
import { createForwardManager, type ForwardManager } from "./forwards";
import { isSafeHost, sshArgs } from "./runner";
import type { SshTarget } from "./types";

/** Split `[user@]host[:port]` — mirrors the renderer's parseSshTarget. */
function parseTarget(connectionId: string): SshTarget {
  let rest = connectionId;
  let user: string | undefined;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    user = rest.slice(0, at) || undefined;
    rest = rest.slice(at + 1);
  }
  let port: number | undefined;
  const colon = rest.lastIndexOf(":");
  if (colon >= 0 && /^\d+$/.test(rest.slice(colon + 1))) {
    port = Number(rest.slice(colon + 1));
    rest = rest.slice(0, colon);
  }
  return { connectionId, host: rest, user, port };
}

/** Build a validated SshTarget from a public capability payload. */
export function resolveTarget(payload: Record<string, unknown>): SshTarget {
  const connectionId = payload.connectionId;
  if (typeof connectionId !== "string" || !isSafeHost(connectionId)) {
    throw new Error(`invalid ssh connection id: ${String(connectionId)}`);
  }
  return parseTarget(connectionId);
}

// ---- port forwards ---------------------------------------------------------
// The manager itself is electron-free (unit-tested with a fake ssh); the
// production wiring — real spawn, broadcast, userData store — lives here.

let forwards: ForwardManager | null = null;

/** Lazily created singleton shared by capability consumers and the before-quit
 * / process-exit teardown paths below. */
export function forwardManager(): ForwardManager {
  forwards ??= createForwardManager({
    spawnSsh: (args) =>
      spawn("ssh", args, {
        stdio: ["ignore", "ignore", "pipe"],
        // OpenSSH messages are English-only, but keep parsing locale-proof.
        env: { ...process.env, LC_ALL: "C" },
      }),
    sshArgs,
    resolveTarget: parseTarget,
    emit,
    storeFile: join(app.getPath("userData"), "termco-forwards.json"),
  });
  return forwards;
}

// ---- server state hub ------------------------------------------------------
// Mirrors the remote agent's pushed containers/ports snapshots; persists the
// last known state so panels have data even before the first connect.

let stateHub: ClientStateHub | null = null;

/** Lazily created singleton attached by the provider to every ready
 * connection. */
export function clientStateHub(): ClientStateHub {
  stateHub ??= createClientStateHub({
    emit,
    storeFile: join(app.getPath("userData"), "termco-ssh-state.json"),
  });
  return stateHub;
}

/** before-quit: kill tunnel children (keeps `desired` for the next launch). */
export function shutdownForwards(): void {
  forwards?.shutdown();
}

/** process-exit belt and braces: synchronous SIGKILL sweep. */
export function killForwardsSync(): void {
  forwards?.killAllSync();
}

/** Wake-from-sleep retry, but ONLY if the manager already exists — resuming
 * must never be the thing that creates it. */
export function resumeForwards(): void {
  forwards?.onResume();
}
