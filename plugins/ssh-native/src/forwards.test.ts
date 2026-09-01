/**
 * Forward-manager state machine, driven by a fake ssh (real node child
 * processes whose stderr scripts the behaviors: listening, bind failure,
 * auth failure, resolve failure, die-after-active). Timings are shrunk via
 * the injectable knobs; no fake timers (child exits are real async).
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyStderrLine,
  createForwardManager,
  type ForwardManager,
  forwardId,
} from "./forwards";
import type { SshTarget } from "./types";

const LISTEN = `console.error("debug1: Local forwarding listening on 127.0.0.1 port 9999."); setInterval(() => {}, 1000);`;
const SILENT = `setInterval(() => {}, 1000);`;
const BIND_FAIL = `console.error("bind [127.0.0.1]:9999: Address already in use"); process.exit(255);`;
const BIND_FAIL_OTHER_PORT = `console.error("bind [127.0.0.1]:3000: Address already in use"); process.exit(255);`;
const AUTH_FAIL = `console.error("kevin@host: Permission denied (publickey,password)."); process.exit(255);`;
const RESOLVE_FAIL = `console.error("ssh: Could not resolve hostname host: nodename nor servname provided"); process.exit(255);`;
const LISTEN_THEN_DIE = `console.error("debug1: Local forwarding listening on 127.0.0.1 port 9999."); setTimeout(() => process.exit(255), 150);`;

function harness(
  opts: { storeFile?: string | null; activeFallbackMs?: number } = {},
) {
  const behaviors: string[] = [];
  const spawned: ChildProcess[] = [];
  const events: Array<{ event: string; payload: unknown }> = [];
  const manager = createForwardManager({
    spawnSsh: () => {
      const script = behaviors.length > 1 ? behaviors.shift() : behaviors[0];
      const child = spawn(process.execPath, ["-e", script ?? LISTEN]);
      spawned.push(child);
      return child;
    },
    sshArgs: (_t: SshTarget, _r: string[], extra: string[]) => extra,
    resolveTarget: (connectionId) => ({ connectionId, host: connectionId }),
    emit: (event, payload) => events.push({ event, payload }),
    storeFile: opts.storeFile === undefined ? null : opts.storeFile,
    backoffBaseMs: 20,
    backoffCapMs: 80,
    activeFallbackMs: opts.activeFallbackMs ?? 250,
    stabilityMs: 150,
    resumeStaggerMs: 5,
  });
  return { manager, behaviors, spawned, events };
}

async function waitFor<T>(
  fn: () => Promise<T> | T,
  pred: (v: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (pred(v)) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out; last: ${JSON.stringify(v)}`);
    }
    await new Promise((r) => setTimeout(r, 15));
  }
}

const state = (m: ForwardManager, id: string) => async () =>
  (await m.list()).find((f) => f.id === id);

const managers: ForwardManager[] = [];
function track(h: ReturnType<typeof harness>) {
  managers.push(h.manager);
  return h;
}

afterEach(() => {
  for (const m of managers) m.killAllSync();
  managers.length = 0;
});

describe("forward lifecycle", () => {
  it("becomes active when ssh reports the listening line", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const f = await h.manager.add("host1", { localPort: 9999, remotePort: 80 });
    expect(f.state).toBe("starting");
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    expect(h.events.some((e) => e.event === "ssh:forwards-changed")).toBe(true);
  });

  it("falls back to active when the child stays alive without the line", async () => {
    const h = track(harness());
    h.behaviors.push(SILENT);
    const f = await h.manager.add("host1", { localPort: 9998, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
  });

  it("classifies a bind failure as permanent — no retry loop", async () => {
    const h = track(harness());
    h.behaviors.push(BIND_FAIL);
    const f = await h.manager.add("host1", { localPort: 9999, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "error");
    const count = h.spawned.length;
    await new Promise((r) => setTimeout(r, 300)); // several backoff windows
    expect(h.spawned.length).toBe(count);
    const info = await state(h.manager, f.id)();
    expect(info?.error).toContain("already in use");
  });

  it("hints at ssh-config LocalForward when a foreign port fails to bind", async () => {
    const h = track(harness());
    h.behaviors.push(BIND_FAIL_OTHER_PORT);
    const f = await h.manager.add("host1", { localPort: 9999, remotePort: 80 });
    const info = await waitFor(state(h.manager, f.id), (v) => v?.state === "error");
    expect(info?.error).toContain("LocalForward in your ssh config");
  });

  it("classifies auth failure as permanent regardless of timing", async () => {
    const h = track(harness());
    h.behaviors.push(AUTH_FAIL);
    const f = await h.manager.add("host1", { localPort: 9997, remotePort: 80 });
    const info = await waitFor(state(h.manager, f.id), (v) => v?.state === "error");
    expect(info?.error).toContain("authentication failed");
  });

  it("retries resolve failures and recovers once the host resolves", async () => {
    // Full-suite CPU pressure can make a freshly spawned Node process take
    // longer than the normal 250 ms test fallback to execute its failure
    // script. Keep this assertion about three classified attempts, not host
    // process startup latency.
    const h = track(harness({ activeFallbackMs: 2_000 }));
    h.behaviors.push(RESOLVE_FAIL, RESOLVE_FAIL, LISTEN);
    const f = await h.manager.add("host1", { localPort: 9996, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    expect(h.spawned.length).toBe(3);
  });

  it("reconnects after an active tunnel dies (disconnect)", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN_THEN_DIE, LISTEN);
    const f = await h.manager.add("host1", { localPort: 9995, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    // Tunnel dies → reconnecting → second child → active again.
    await waitFor(() => h.spawned.length, (n) => n >= 2);
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
  });

  it("stop() kills the child and never resurrects", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const f = await h.manager.add("host1", { localPort: 9994, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    const stopped = await h.manager.stop(f.id);
    expect(stopped.state).toBe("stopped");
    const count = h.spawned.length;
    await new Promise((r) => setTimeout(r, 250));
    expect(h.spawned.length).toBe(count);
    expect(h.spawned[0].killed || h.spawned[0].exitCode !== null).toBe(true);
  });

  it("stop() during reconnecting cancels the backoff", async () => {
    const h = track(harness());
    h.behaviors.push(RESOLVE_FAIL, RESOLVE_FAIL, RESOLVE_FAIL, RESOLVE_FAIL);
    const f = await h.manager.add("host1", { localPort: 9993, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "reconnecting");
    await h.manager.stop(f.id);
    const count = h.spawned.length;
    await new Promise((r) => setTimeout(r, 300));
    expect(h.spawned.length).toBe(count);
    expect((await state(h.manager, f.id)())?.state).toBe("stopped");
  });

  it("start() after a permanent error retries fresh", async () => {
    const h = track(harness());
    h.behaviors.push(AUTH_FAIL, LISTEN);
    const f = await h.manager.add("host1", { localPort: 9992, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "error");
    await h.manager.start(f.id);
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
  });
});

describe("add/remove semantics", () => {
  it("rejects a duplicate local port across connections", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    await h.manager.add("host1", { localPort: 9991, remotePort: 80 });
    await expect(
      h.manager.add("host2", { localPort: 9991, remotePort: 81 }),
    ).rejects.toThrow("already forwarded");
  });

  it("re-adding the identical spec returns the existing forward", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const a = await h.manager.add("host1", { localPort: 9990, remotePort: 80 });
    const b = await h.manager.add("host1", { localPort: 9990, remotePort: 80 });
    expect(b.id).toBe(a.id);
    expect(h.spawned.length).toBe(1);
  });

  it("allocates a free local port for 'auto'", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const f = await h.manager.add("host1", { localPort: "auto", remotePort: 80 });
    expect(f.localPort).toBeGreaterThan(0);
    expect(f.localPort).toBeLessThan(65536);
  });

  it("remove() tears down and forgets the forward", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const f = await h.manager.add("host1", { localPort: 9989, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    await h.manager.remove(f.id);
    expect(await h.manager.list()).toEqual([]);
  });

  it("validates ports and remote host", async () => {
    const h = track(harness());
    await expect(
      h.manager.add("host1", { localPort: 0, remotePort: 80 }),
    ).rejects.toThrow("invalid local port");
    await expect(
      h.manager.add("host1", { localPort: 8080, remotePort: 70000 }),
    ).rejects.toThrow("invalid remote port");
    await expect(
      h.manager.add("host1", {
        localPort: 8080,
        remotePort: 80,
        remoteHost: "evil:1",
      }),
    ).rejects.toThrow("invalid remote host");
  });
});

describe("persistence + ensure", () => {
  it("restores persisted running forwards via ensure(), untouched tombstones", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-fwd-"));
    const file = join(dir, "forwards.json");

    const a = track(harness({ storeFile: file }));
    a.behaviors.push(LISTEN);
    const running = await a.manager.add("host1", {
      localPort: 9988,
      remotePort: 80,
    });
    a.behaviors.push(LISTEN);
    const stopped = await a.manager.add("host1", {
      localPort: 9987,
      remotePort: 81,
    });
    await a.manager.stop(stopped.id);
    await a.manager.flushPersist();
    a.manager.shutdown();

    const b = track(harness({ storeFile: file }));
    b.behaviors.push(LISTEN);
    const before = await b.manager.list("host1");
    expect(before).toHaveLength(2);
    expect(before.every((f) => f.state === "stopped")).toBe(true);

    await b.manager.ensure("host1");
    await waitFor(
      state(b.manager, running.id),
      (v) => v?.state === "active",
    );
    // The user-stopped forward stays a tombstone.
    expect((await state(b.manager, stopped.id)())?.state).toBe("stopped");
    expect(b.spawned.length).toBe(1);
  });

  it("deterministic ids make double-ensure idempotent", () => {
    expect(forwardId("h", 1, "127.0.0.1", 2)).toBe(
      forwardId("h", 1, "127.0.0.1", 2),
    );
    expect(forwardId("h", 1, "127.0.0.1", 2)).not.toBe(
      forwardId("h", 1, "127.0.0.1", 3),
    );
  });
});

describe("shutdown", () => {
  it("kills all children without flipping desired, idempotent", async () => {
    const h = track(harness());
    h.behaviors.push(LISTEN);
    const f = await h.manager.add("host1", { localPort: 9986, remotePort: 80 });
    await waitFor(state(h.manager, f.id), (v) => v?.state === "active");
    h.manager.shutdown();
    h.manager.shutdown(); // before-quit can fire twice
    await waitFor(
      () => h.spawned[0].exitCode !== null || h.spawned[0].killed,
      (v) => v === true,
    );
    // desired stays "running" so the next launch can restore it.
    expect((await state(h.manager, f.id)())?.desired).toBe("running");
  });
});

describe("classifyStderrLine", () => {
  it("maps ssh stderr to verdicts", () => {
    expect(
      classifyStderrLine("bind [127.0.0.1]:80: Permission denied", 80)?.kind,
    ).toBe("permanent");
    expect(
      classifyStderrLine("Host key verification failed.", 80)?.kind,
    ).toBe("permanent");
    expect(
      classifyStderrLine(
        "@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @",
        80,
      )?.kind,
    ).toBe("permanent");
    expect(
      classifyStderrLine("ssh: Could not resolve hostname x", 80)?.kind,
    ).toBe("retryable");
    expect(
      classifyStderrLine("kex_exchange_identification: Connection reset", 80)
        ?.kind,
    ).toBe("retryable");
    expect(classifyStderrLine("debug1: something benign", 80)).toBeNull();
  });
});
