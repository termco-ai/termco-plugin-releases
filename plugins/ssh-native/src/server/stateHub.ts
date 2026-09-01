/**
 * Owned by the ssh-native provider's deployed remote daemon.
 * Server-side state hub: collects host state (containers, listening ports)
 * on its own schedule, remembers the last snapshot ACROSS server restarts
 * (atomic disk cache), and pushes full per-domain snapshots to subscribed
 * channels — but only when something actually changed.
 *
 * Push is an optimization, never a correctness dependency: every subscribe
 * gets an immediate full push of whatever is known (possibly `stale` from
 * the disk cache), and the client can always re-subscribe after a reconnect.
 * Collector failures stay inside their domain snapshot — one broken domain
 * (say, docker missing) never stops the others.
 */
import { promises as fsp } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export type DomainSpec = {
  name: string;
  intervalMs: number;
  collect: () => Promise<unknown>;
};

export type DomainSnapshot = {
  domain: string;
  data: unknown;
  collectedAt: number;
  /** From the disk cache / a previous run — not yet confirmed fresh. */
  stale: boolean;
  error: string | null;
};

export type StateHubDeps = {
  domains: DomainSpec[];
  emit: (channel: number, event: string, data: unknown) => void;
  /** null disables persistence (tests). */
  cacheFile: string | null;
  persistDebounceMs?: number;
};

type PersistedCache = {
  domains: Record<string, { data: unknown; collectedAt: number }>;
};

export function createStateHub(deps: StateHubDeps) {
  const persistDebounce = deps.persistDebounceMs ?? 10_000;
  const snapshots = new Map<string, DomainSnapshot>();
  const hashes = new Map<string, string>();
  const subscribers = new Set<number>();
  const timers = new Map<string, NodeJS.Timeout>();
  let persistTimer: NodeJS.Timeout | null = null;
  let persistChain: Promise<void> = Promise.resolve();
  let loaded: Promise<void> | null = null;

  function ensureLoaded(): Promise<void> {
    loaded ??= (async () => {
      if (!deps.cacheFile) return;
      try {
        const raw = await fsp.readFile(deps.cacheFile, "utf8");
        const parsed = JSON.parse(raw) as PersistedCache;
        for (const spec of deps.domains) {
          const cached = parsed.domains?.[spec.name];
          if (!cached) continue;
          snapshots.set(spec.name, {
            domain: spec.name,
            data: cached.data,
            collectedAt: cached.collectedAt,
            stale: true,
            error: null,
          });
        }
      } catch {
        // No cache yet, or corrupted — start empty, never crash.
      }
    })();
    return loaded;
  }

  function schedulePersist(): void {
    if (!deps.cacheFile || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, persistDebounce);
    persistTimer.unref?.();
  }

  function persistNow(): Promise<void> {
    // A manual flush replaces the pending debounce. Otherwise a caller can
    // await this write while a second scheduled write is still able to start
    // immediately afterwards.
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const file = deps.cacheFile;
    if (!file) return Promise.resolve();
    const out: PersistedCache = { domains: {} };
    for (const [name, snap] of snapshots) {
      // Only confirmed-fresh data is worth caching; errors are transient.
      if (!snap.stale && snap.error === null) {
        out.domains[name] = { data: snap.data, collectedAt: snap.collectedAt };
      }
    }
    persistChain = persistChain.then(async () => {
      try {
        await fsp.mkdir(dirname(file), { recursive: true });
        const tmp = join(
          dirname(file),
          `.${randomBytes(8).toString("hex")}.termco.tmp`,
        );
        await fsp.writeFile(tmp, JSON.stringify(out), { flag: "wx" });
        await fsp.rename(tmp, file);
      } catch (err) {
        console.error("[state-hub] persist failed:", err);
      }
    });
    return persistChain;
  }

  function pushTo(channels: Iterable<number>, snap: DomainSnapshot): void {
    for (const ch of channels) deps.emit(ch, "state", snap);
  }

  async function collectDomain(spec: DomainSpec): Promise<void> {
    let snap: DomainSnapshot;
    let hash: string;
    try {
      const data = await spec.collect();
      hash = JSON.stringify(data);
      snap = {
        domain: spec.name,
        data,
        collectedAt: Date.now(),
        stale: false,
        error: null,
      };
    } catch (err) {
      hash = `error:${err instanceof Error ? err.message : String(err)}`;
      const prev = snapshots.get(spec.name);
      snap = {
        domain: spec.name,
        data: prev?.data ?? null,
        collectedAt: prev?.collectedAt ?? Date.now(),
        stale: prev?.stale ?? false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    const prevWasStale = snapshots.get(spec.name)?.stale ?? true;
    const changed = hashes.get(spec.name) !== hash || prevWasStale;
    hashes.set(spec.name, hash);
    snapshots.set(spec.name, snap);
    if (changed) {
      pushTo(subscribers, snap);
      if (snap.error === null) schedulePersist();
    }
  }

  function startLoops(): void {
    for (const spec of deps.domains) {
      if (timers.has(spec.name)) continue;
      void collectDomain(spec);
      const timer = setInterval(() => void collectDomain(spec), spec.intervalMs);
      timer.unref?.();
      timers.set(spec.name, timer);
    }
  }

  function stopLoops(): void {
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
  }

  async function subscribe(channel: number): Promise<void> {
    await ensureLoaded();
    subscribers.add(channel);
    // Immediate full push of everything known (possibly stale from disk).
    for (const snap of snapshots.values()) pushTo([channel], snap);
    startLoops();
  }

  function unsubscribe(channel: number): void {
    subscribers.delete(channel);
    if (subscribers.size === 0) stopLoops();
  }

  return { subscribe, unsubscribe, flushPersist: () => persistChain, persistNow };
}

export type StateHub = ReturnType<typeof createStateHub>;
