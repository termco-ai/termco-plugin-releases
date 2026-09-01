/**
 * SSH local port forwards (`ssh -L`): one dedicated `ssh -v -N -L` child PER
 * forward, deliberately independent from the RPC connection and from sibling
 * forwards — 1:1 failure domains, and changing the set never bounces other
 * tunnels.
 *
 * Lifecycle hazards this module is built around (see plan):
 * - "Active" is detected by latching ssh's own `-v` stderr line
 *   ("Local forwarding listening on … port N"), with an alive-timeout
 *   fallback. NEVER by TCP-probing the local port: every accepted probe
 *   opens a real channel to the remote service.
 * - Unexpected exits reconnect with capped exponential backoff + jitter.
 *   stderr is classified line-wise as it arrives (latched — `-v` churn would
 *   rotate setup lines out of any ring): auth/bind/host-key failures are
 *   PERMANENT (no retry — hammering failed auth gets IPs fail2banned),
 *   DNS-resolve failures are RETRYABLE (normal after wake/VPN flap).
 * - Every async hop validates a per-entry generation counter and the child
 *   identity, so a slow-dying old child can never clobber its successor.
 * - stop() flips intent BEFORE killing and resolves when the child exited,
 *   so add→remove→add on the same port never races the released socket.
 * - The module is electron-free; production deps (broadcast, store path,
 *   powerMonitor) are wired in ./index.ts.
 */
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import { createServer } from "node:net";
import { dirname } from "node:path";
import type { SshTarget } from "./types";

export type ForwardState =
  | "starting"
  | "active"
  | "reconnecting"
  | "error"
  | "stopped";

export type ForwardInfo = {
  id: string;
  connectionId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  state: ForwardState;
  /** Human-readable failure detail (permanent errors and reconnect causes). */
  error: string | null;
  desired: "running" | "stopped";
};

export type ForwardAddInput = {
  localPort: number | "auto";
  remotePort: number;
  remoteHost?: string;
};

export type ForwardManagerDeps = {
  /** Spawn the ssh binary with the given argv (injectable for tests). */
  spawnSsh: (args: string[]) => ChildProcess;
  /** Build the ssh argv for a target (production: runner.ts sshArgs). */
  sshArgs: (target: SshTarget, remote: string[], extraOpts: string[]) => string[];
  /** connectionId → validated target (production: ssh/index.ts parseTarget). */
  resolveTarget: (connectionId: string) => SshTarget;
  /** Push a state snapshot to the renderer(s). */
  emit: (event: string, payload: unknown) => void;
  /** JSON persistence file; null disables persistence. */
  storeFile: string | null;
  /** Timing knobs (tests shrink these). */
  backoffBaseMs?: number;
  backoffCapMs?: number;
  /** Child alive this long without the listening line still counts as active
   * (must exceed ssh's ConnectTimeout). */
  activeFallbackMs?: number;
  /** Active this long resets the retry counter. */
  stabilityMs?: number;
  /** Per-forward stagger when a resume retries many forwards at once. */
  resumeStaggerMs?: number;
};

type Entry = {
  id: string;
  connectionId: string;
  target: SshTarget;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  desired: "running" | "stopped";
  state: ForwardState;
  error: string | null;
  attempt: number;
  /** Bumped by stop/start/remove; async continuations bail on mismatch. */
  gen: number;
  child: ChildProcess | null;
  /** Resolves when the CURRENT child has fully exited (teardown barrier). */
  childExit: Promise<void> | null;
  backoffTimer: NodeJS.Timeout | null;
  fallbackTimer: NodeJS.Timeout | null;
  stabilityTimer: NodeJS.Timeout | null;
  /** Latched classification for the current attempt. */
  verdict: { kind: "permanent" | "retryable"; message: string } | null;
  sawListening: boolean;
  lineBuf: string;
};

type PersistedForward = {
  connectionId: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  desired: "running" | "stopped";
};

const REMOTE_HOST_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function forwardId(
  connectionId: string,
  localPort: number,
  remoteHost: string,
  remotePort: number,
): string {
  return `fwd-${createHash("sha1")
    .update(`${connectionId}|${localPort}|${remoteHost}|${remotePort}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function validPort(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0 && (n as number) < 65536;
}

/** Classify one ssh stderr line. Returns null when the line decides nothing. */
export function classifyStderrLine(
  line: string,
  localPort: number,
): { kind: "permanent" | "retryable"; message: string } | null {
  if (line.includes("Address already in use")) {
    // A bind failure naming a DIFFERENT port comes from a LocalForward in the
    // user's ~/.ssh/config (ExitOnForwardFailure kills us for it too).
    const m = line.match(/:(\d+)[:\s]/);
    const other = m && Number(m[1]) !== localPort;
    return {
      kind: "permanent",
      message: other
        ? `port ${m?.[1]} already in use — conflicts with a LocalForward in your ssh config`
        : `local port ${localPort} already in use (possibly an orphaned ssh from a previous session)`,
    };
  }
  if (/bind[^\n]*Permission denied/i.test(line)) {
    return {
      kind: "permanent",
      message: `cannot bind local port ${localPort}: permission denied (ports below 1024 need elevated rights)`,
    };
  }
  if (line.includes("Host key verification failed")) {
    return { kind: "permanent", message: "host key verification failed" };
  }
  if (line.includes("REMOTE HOST IDENTIFICATION HAS CHANGED")) {
    return {
      kind: "permanent",
      message:
        "REMOTE HOST IDENTIFICATION HAS CHANGED — verify the server's host key",
    };
  }
  if (/Permission denied \(/.test(line)) {
    return { kind: "permanent", message: `authentication failed: ${line.trim()}` };
  }
  if (line.includes("Could not resolve hostname")) {
    // Normal right after wake / VPN flap — must stay retryable.
    return { kind: "retryable", message: line.trim() };
  }
  if (/Connection (refused|reset|closed|timed out)/i.test(line)) {
    return { kind: "retryable", message: line.trim() };
  }
  return null;
}

const LISTENING_RE = /Local forwarding listening/;

export function createForwardManager(deps: ForwardManagerDeps) {
  const backoffBase = deps.backoffBaseMs ?? 1_000;
  const backoffCap = deps.backoffCapMs ?? 30_000;
  const activeFallback = deps.activeFallbackMs ?? 20_000;
  const stabilityMs = deps.stabilityMs ?? 30_000;
  const resumeStagger = deps.resumeStaggerMs ?? 250;

  const entries = new Map<string, Entry>();
  // All mutations for one connection run strictly in sequence.
  const queues = new Map<string, Promise<unknown>>();
  let loaded: Promise<void> | null = null;
  let shutdownFlag = false;

  function enqueue<T>(connectionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = queues.get(connectionId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    queues.set(
      connectionId,
      next.catch(() => {}),
    );
    return next;
  }

  function info(e: Entry): ForwardInfo {
    return {
      id: e.id,
      connectionId: e.connectionId,
      localPort: e.localPort,
      remoteHost: e.remoteHost,
      remotePort: e.remotePort,
      state: e.state,
      error: e.error,
      desired: e.desired,
    };
  }

  function list(connectionId?: string): ForwardInfo[] {
    return [...entries.values()]
      .filter((e) => !connectionId || e.connectionId === connectionId)
      .map(info);
  }

  function emitChanged(connectionId: string): void {
    deps.emit("ssh:forwards-changed", {
      connectionId,
      forwards: list(connectionId),
    });
  }

  function clearTimers(e: Entry): void {
    if (e.backoffTimer) clearTimeout(e.backoffTimer);
    if (e.fallbackTimer) clearTimeout(e.fallbackTimer);
    if (e.stabilityTimer) clearTimeout(e.stabilityTimer);
    e.backoffTimer = e.fallbackTimer = e.stabilityTimer = null;
  }

  // ---- persistence ---------------------------------------------------------

  // Writes are chained so concurrent persist() calls can never interleave
  // (a slow older write must not clobber a newer snapshot). The snapshot is
  // taken synchronously at call time to preserve ordering.
  let persistChain: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const file = deps.storeFile;
    if (!file) return Promise.resolve();
    const forwards: PersistedForward[] = [...entries.values()].map((e) => ({
      connectionId: e.connectionId,
      localPort: e.localPort,
      remoteHost: e.remoteHost,
      remotePort: e.remotePort,
      desired: e.desired,
    }));
    persistChain = persistChain.then(async () => {
      try {
        await fsp.mkdir(dirname(file), { recursive: true });
        await fsp.writeFile(
          file,
          JSON.stringify({ forwards }, null, 2),
          "utf8",
        );
      } catch (err) {
        console.error("[ssh-forwards] persist failed:", err);
      }
    });
    return persistChain;
  }

  /** Resolves when every persist() enqueued so far has hit disk. */
  function flushPersist(): Promise<void> {
    return persistChain;
  }

  function ensureLoaded(): Promise<void> {
    loaded ??= (async () => {
      if (!deps.storeFile) return;
      let raw: string;
      try {
        raw = await fsp.readFile(deps.storeFile, "utf8");
      } catch {
        return; // no file yet
      }
      try {
        const parsed = JSON.parse(raw) as { forwards?: PersistedForward[] };
        for (const f of parsed.forwards ?? []) {
          try {
            if (!validPort(f.localPort) || !validPort(f.remotePort)) continue;
            if (!REMOTE_HOST_RE.test(f.remoteHost)) continue;
            const id = forwardId(
              f.connectionId,
              f.localPort,
              f.remoteHost,
              f.remotePort,
            );
            if (entries.has(id)) continue;
            // resolveTarget throws on ids a corrupted store may contain —
            // one bad entry must not abort the rest.
            entries.set(id, makeEntry(id, f, "stopped"));
          } catch {
            // skip unparseable persisted forward
          }
        }
      } catch (err) {
        console.error("[ssh-forwards] store unreadable:", err);
      }
    })();
    return loaded;
  }

  function makeEntry(
    id: string,
    f: PersistedForward,
    state: ForwardState,
  ): Entry {
    return {
      id,
      connectionId: f.connectionId,
      target: deps.resolveTarget(f.connectionId),
      localPort: f.localPort,
      remoteHost: f.remoteHost,
      remotePort: f.remotePort,
      desired: f.desired,
      state,
      error: null,
      attempt: 0,
      gen: 0,
      child: null,
      childExit: null,
      backoffTimer: null,
      fallbackTimer: null,
      stabilityTimer: null,
      verdict: null,
      sawListening: false,
      lineBuf: "",
    };
  }

  // ---- lifecycle -----------------------------------------------------------

  function spawnAttempt(e: Entry): void {
    if (shutdownFlag || e.desired !== "running") return;
    const gen = e.gen;
    e.state = e.attempt === 0 ? "starting" : "reconnecting";
    e.verdict = null;
    e.sawListening = false;
    e.lineBuf = "";

    const spec = `127.0.0.1:${e.localPort}:${e.remoteHost}:${e.remotePort}`;
    const args = deps.sshArgs(e.target, [], [
      "-v",
      "-N",
      "-L",
      spec,
      "-o",
      "ServerAliveInterval=10",
      "-o",
      "ServerAliveCountMax=3",
      "-o",
      "ExitOnForwardFailure=yes",
    ]);

    let child: ChildProcess;
    try {
      child = deps.spawnSsh(args);
    } catch (err) {
      e.state = "error";
      e.error = `failed to spawn ssh: ${String(err)}`;
      emitChanged(e.connectionId);
      return;
    }
    e.child = child;

    let settled = false;
    let exitResolve: () => void = () => {};
    e.childExit = new Promise<void>((r) => {
      exitResolve = r;
    });

    const stale = () => entries.get(e.id) !== e || e.gen !== gen || e.child !== child;

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stale()) return;
      e.lineBuf += chunk.toString("utf8");
      // Scan complete lines; keep the partial trailing line buffered.
      let nl = e.lineBuf.indexOf("\n");
      while (nl >= 0) {
        const line = e.lineBuf.slice(0, nl);
        e.lineBuf = e.lineBuf.slice(nl + 1);
        if (!e.sawListening && LISTENING_RE.test(line)) {
          e.sawListening = true;
          markActive(e, gen, child);
        }
        // First classification wins for this attempt.
        e.verdict ??= classifyStderrLine(line, e.localPort);
        nl = e.lineBuf.indexOf("\n");
      }
      if (e.lineBuf.length > 16 * 1024) e.lineBuf = e.lineBuf.slice(-8 * 1024);
    });

    e.fallbackTimer = setTimeout(() => {
      if (stale() || e.state === "active") return;
      markActive(e, gen, child);
    }, activeFallback);

    const onSettled = (cause: string | null) => {
      if (settled) return;
      settled = true;
      exitResolve();
      if (stale()) return;
      clearTimers(e);
      e.child = null;
      if (e.desired === "stopped") {
        e.state = "stopped";
        emitChanged(e.connectionId);
        return;
      }
      const verdict =
        cause !== null
          ? { kind: "permanent" as const, message: cause }
          : e.verdict;
      if (verdict?.kind === "permanent") {
        e.state = "error";
        e.error = verdict.message;
        emitChanged(e.connectionId);
        return;
      }
      // Retryable (or unclassified) — back off and try again.
      e.error = verdict?.message ?? "connection lost";
      e.state = "reconnecting";
      emitChanged(e.connectionId);
      scheduleRetry(e);
    };

    // spawn errors (ENOENT: ssh missing) fire "error" with NO "exit".
    child.on("error", (err) =>
      onSettled(`failed to run ssh: ${err.message}`),
    );
    child.on("exit", () => onSettled(null));
  }

  function markActive(e: Entry, gen: number, child: ChildProcess): void {
    if (entries.get(e.id) !== e || e.gen !== gen || e.child !== child) return;
    e.state = "active";
    e.error = null;
    if (e.stabilityTimer) clearTimeout(e.stabilityTimer);
    e.stabilityTimer = setTimeout(() => {
      // Stable long enough — future failures start the backoff ladder fresh.
      if (entries.get(e.id) === e && e.gen === gen) e.attempt = 0;
    }, stabilityMs);
    emitChanged(e.connectionId);
  }

  function scheduleRetry(e: Entry, immediateDelay?: number): void {
    if (shutdownFlag || e.desired !== "running") return;
    const gen = e.gen;
    const base = Math.min(backoffBase * 2 ** e.attempt, backoffCap);
    const jitter = 0.8 + Math.random() * 0.4;
    const delay = immediateDelay ?? Math.round(base * jitter);
    e.attempt += 1;
    if (e.backoffTimer) clearTimeout(e.backoffTimer);
    e.backoffTimer = setTimeout(() => {
      e.backoffTimer = null;
      if (entries.get(e.id) !== e || e.gen !== gen || e.desired !== "running") {
        return;
      }
      void enqueue(e.connectionId, async () => {
        if (entries.get(e.id) !== e || e.gen !== gen || e.desired !== "running") {
          return;
        }
        await (e.childExit ?? Promise.resolve());
        spawnAttempt(e);
      });
    }, delay);
  }

  async function stopEntry(e: Entry): Promise<void> {
    e.desired = "stopped";
    e.gen += 1;
    clearTimers(e);
    const child = e.child;
    const exited = e.childExit;
    if (child) {
      child.kill();
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      killTimer.unref?.();
      await exited;
      clearTimeout(killTimer);
    }
    e.child = null;
    e.state = "stopped";
    e.error = null;
  }

  // ---- public API ----------------------------------------------------------

  async function add(
    connectionId: string,
    input: ForwardAddInput,
  ): Promise<ForwardInfo> {
    await ensureLoaded();
    const remoteHost = input.remoteHost ?? "127.0.0.1";
    if (!validPort(input.remotePort)) {
      throw new Error(`invalid remote port: ${input.remotePort}`);
    }
    if (!REMOTE_HOST_RE.test(remoteHost)) {
      throw new Error(`invalid remote host: ${remoteHost}`);
    }
    let localPort: number;
    if (input.localPort === "auto") {
      localPort = await allocateEphemeralPort();
    } else {
      if (!validPort(input.localPort)) {
        throw new Error(`invalid local port: ${input.localPort}`);
      }
      localPort = input.localPort;
    }

    return enqueue(connectionId, async () => {
      const id = forwardId(connectionId, localPort, remoteHost, input.remotePort);
      const existing = entries.get(id);
      if (existing) {
        if (existing.desired === "running") return info(existing);
        return restart(existing);
      }
      // Local ports bind globally — reject across ALL connections.
      for (const other of entries.values()) {
        if (other.localPort === localPort && other.desired === "running") {
          throw new Error(
            `local port ${localPort} is already forwarded (${other.connectionId})`,
          );
        }
      }
      const entry = makeEntry(
        id,
        {
          connectionId,
          localPort,
          remoteHost,
          remotePort: input.remotePort,
          desired: "running",
        },
        "starting",
      );
      entries.set(id, entry);
      emitChanged(connectionId);
      void persist();
      spawnAttempt(entry);
      return info(entry);
    });
  }

  async function restart(e: Entry): Promise<ForwardInfo> {
    e.desired = "running";
    e.gen += 1;
    e.attempt = 0;
    e.state = "starting";
    e.error = null;
    emitChanged(e.connectionId);
    void persist();
    // A previous child may still be alive (start() on a running-but-stuck
    // forward); its handlers are stale now (gen bumped) so kill explicitly
    // and wait for the socket to be released before rebinding.
    e.child?.kill();
    await (e.childExit ?? Promise.resolve());
    spawnAttempt(e);
    return info(e);
  }

  async function start(id: string): Promise<ForwardInfo> {
    await ensureLoaded();
    const e = entries.get(id);
    if (!e) throw new Error(`unknown forward: ${id}`);
    return enqueue(e.connectionId, () => restart(e));
  }

  async function stop(id: string): Promise<ForwardInfo> {
    await ensureLoaded();
    const e = entries.get(id);
    if (!e) throw new Error(`unknown forward: ${id}`);
    return enqueue(e.connectionId, async () => {
      await stopEntry(e);
      emitChanged(e.connectionId);
      void persist();
      return info(e);
    });
  }

  async function remove(id: string): Promise<void> {
    await ensureLoaded();
    const e = entries.get(id);
    if (!e) return;
    await enqueue(e.connectionId, async () => {
      await stopEntry(e);
      entries.delete(id);
      emitChanged(e.connectionId);
      void persist();
    });
  }

  /** Start every persisted `desired: running` forward for this connection.
   * Strictly create-if-absent: live entries (including user-stopped
   * tombstones) are never touched, so a stale ensure can't resurrect. */
  async function ensure(connectionId: string): Promise<ForwardInfo[]> {
    await ensureLoaded();
    return enqueue(connectionId, async () => {
      for (const e of entries.values()) {
        if (
          e.connectionId === connectionId &&
          e.desired === "running" &&
          e.state === "stopped" &&
          !e.child
        ) {
          // Persisted as running but never started this app run.
          e.gen += 1;
          e.attempt = 0;
          spawnAttempt(e);
        }
      }
      emitChanged(connectionId);
      return list(connectionId);
    });
  }

  async function listForwards(connectionId?: string): Promise<ForwardInfo[]> {
    await ensureLoaded();
    return list(connectionId);
  }

  /** Kill children without flipping `desired` — the next launch restores
   * running forwards via ensure(). Idempotent (before-quit can re-fire). */
  function shutdown(): void {
    shutdownFlag = true;
    for (const e of entries.values()) {
      e.gen += 1;
      clearTimers(e);
      if (e.child) {
        e.child.kill();
        const t = setTimeout(() => e.child?.kill("SIGKILL"), 2_000);
        t.unref?.();
      }
    }
  }

  /** Last-resort synchronous kill for process exit. */
  function killAllSync(): void {
    for (const e of entries.values()) e.child?.kill("SIGKILL");
  }

  /** Wake from sleep: retry waiting/retryable forwards NOW (staggered — a
   * thundering herd of unauthenticated connections trips sshd MaxStartups). */
  function onResume(): void {
    let i = 0;
    for (const e of entries.values()) {
      if (e.desired !== "running") continue;
      if (e.state !== "reconnecting" && e.state !== "starting") continue;
      if (e.backoffTimer) {
        clearTimeout(e.backoffTimer);
        e.backoffTimer = null;
        scheduleRetry(e, resumeStagger * i);
        i += 1;
      }
    }
  }

  return {
    add,
    start,
    stop,
    remove,
    ensure,
    list: listForwards,
    shutdown,
    killAllSync,
    onResume,
    flushPersist,
  };
}

export type ForwardManager = ReturnType<typeof createForwardManager>;

async function allocateEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => {
        if (validPort(port)) resolve(port);
        else reject(new Error("failed to allocate a local port"));
      });
    });
  });
}
