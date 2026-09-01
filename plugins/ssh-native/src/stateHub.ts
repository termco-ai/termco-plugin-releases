/**
 * Client half of the server state hub: subscribes on every ready connection
 * (initial AND reconnected — wired to onConnectionReady in ./index.ts),
 * mirrors the pushed per-domain snapshots, marks them stale when the
 * connection dies, persists the last known state locally so panels show
 * data even BEFORE the first connect, and re-broadcasts every change to the
 * renderer as `ssh:state-changed`.
 *
 * Electron-free by design (deps injected) — the state machine tests with a
 * fake connection.
 */
import { promises as fsp } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

export type HubDomainState = {
  data: unknown;
  /** Server clock at collection (informational). */
  collectedAt: number;
  /** Client clock when this snapshot arrived/loaded — age = now - receivedAt. */
  receivedAt: number;
  stale: boolean;
  error: string | null;
};

export type HubConnectionState = {
  connectionId: string;
  /** false once the remote answered "unknown method" (old server bundle). */
  supported: boolean;
  domains: Record<string, HubDomainState>;
};

/** The connection surface the hub needs — matches SshConnection. */
export type HubConnection = {
  connectionId: string;
  client: {
    openChannel: (handler: (event: string, data: unknown) => void) => number;
    call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
};

export type ClientStateHubDeps = {
  emit: (event: string, payload: unknown) => void;
  /** null disables local persistence (tests may set a tmp file). */
  storeFile: string | null;
  persistDebounceMs?: number;
};

type Entry = {
  state: HubConnectionState;
  /** Identity of the client we last subscribed on (double-attach guard). */
  attachedClient: HubConnection["client"] | null;
};

type PersistedHub = {
  connections: Record<
    string,
    { domains: Record<string, { data: unknown; collectedAt: number }> }
  >;
};

type ServerSnapshot = {
  domain: string;
  data: unknown;
  collectedAt: number;
  stale: boolean;
  error: string | null;
};

export function createClientStateHub(deps: ClientStateHubDeps) {
  const persistDebounce = deps.persistDebounceMs ?? 5_000;
  const entries = new Map<string, Entry>();
  let loaded: Promise<void> | null = null;
  let persistTimer: NodeJS.Timeout | null = null;
  let persistChain: Promise<void> = Promise.resolve();

  function ensureLoaded(): Promise<void> {
    loaded ??= (async () => {
      if (!deps.storeFile) return;
      try {
        const raw = await fsp.readFile(deps.storeFile, "utf8");
        const parsed = JSON.parse(raw) as PersistedHub;
        for (const [connectionId, conn] of Object.entries(
          parsed.connections ?? {},
        )) {
          const domains: Record<string, HubDomainState> = {};
          for (const [name, d] of Object.entries(conn.domains ?? {})) {
            domains[name] = {
              data: d.data,
              collectedAt: d.collectedAt,
              receivedAt: Date.now(),
              stale: true,
              error: null,
            };
          }
          entries.set(connectionId, {
            state: { connectionId, supported: true, domains },
            attachedClient: null,
          });
        }
      } catch {
        // no cache / corrupted — start empty
      }
    })();
    return loaded;
  }

  function schedulePersist(): void {
    if (!deps.storeFile || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, persistDebounce);
    persistTimer.unref?.();
  }

  function persistNow(): Promise<void> {
    // An explicit flush subsumes the pending debounced write. Leaving that
    // timer alive lets it enqueue a second write immediately after callers
    // have awaited this promise, so a newly-started hub can observe the file
    // between truncate and write.
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const file = deps.storeFile;
    if (!file) return Promise.resolve();
    const out: PersistedHub = { connections: {} };
    for (const [id, entry] of entries) {
      const domains: PersistedHub["connections"][string]["domains"] = {};
      for (const [name, d] of Object.entries(entry.state.domains)) {
        if (d.error === null) {
          domains[name] = { data: d.data, collectedAt: d.collectedAt };
        }
      }
      if (Object.keys(domains).length > 0) out.connections[id] = { domains };
    }
    persistChain = persistChain.then(async () => {
      try {
        await fsp.mkdir(dirname(file), { recursive: true });
        const temporary = join(
          dirname(file),
          `.${randomBytes(8).toString("hex")}.termco.tmp`,
        );
        await fsp.writeFile(temporary, JSON.stringify(out), { flag: "wx" });
        await fsp.rename(temporary, file);
      } catch (err) {
        console.error("[ssh-state] persist failed:", err);
      }
    });
    return persistChain;
  }

  function entryFor(connectionId: string): Entry {
    let entry = entries.get(connectionId);
    if (!entry) {
      entry = {
        state: { connectionId, supported: true, domains: {} },
        attachedClient: null,
      };
      entries.set(connectionId, entry);
    }
    return entry;
  }

  function broadcast(entry: Entry): void {
    deps.emit("ssh:state-changed", entry.state);
  }

  /** Subscribe on a (re)connected server. Called from onConnectionReady. */
  async function attach(conn: HubConnection): Promise<void> {
    await ensureLoaded();
    const entry = entryFor(conn.connectionId);
    if (entry.attachedClient === conn.client) return; // already on this link
    entry.attachedClient = conn.client;

    const channel = conn.client.openChannel((event, data) => {
      if (entries.get(conn.connectionId) !== entry) return;
      if (event === "state") {
        const snap = data as ServerSnapshot;
        entry.state.domains[snap.domain] = {
          data: snap.data,
          collectedAt: snap.collectedAt,
          receivedAt: Date.now(),
          stale: snap.stale,
          error: snap.error,
        };
        broadcast(entry);
        if (!snap.stale && snap.error === null) schedulePersist();
        return;
      }
      if (event === "closed") {
        // Connection died: keep the data, flag it stale, allow re-attach.
        if (entry.attachedClient === conn.client) entry.attachedClient = null;
        for (const d of Object.values(entry.state.domains)) d.stale = true;
        broadcast(entry);
      }
    });

    try {
      await conn.client.call("state.subscribe", { channel });
    } catch (err) {
      if (entry.attachedClient === conn.client) entry.attachedClient = null;
      if (String(err).includes("unknown method")) {
        // Old server bundle without the hub — panels fall back to polling.
        entry.state.supported = false;
        broadcast(entry);
        return;
      }
      // Transient failure (link died mid-subscribe): next ready re-attaches.
    }
  }

  async function getState(connectionId: string): Promise<HubConnectionState> {
    await ensureLoaded();
    return entryFor(connectionId).state;
  }

  return { attach, getState, flushPersist: () => persistChain, persistNow };
}

export type ClientStateHub = ReturnType<typeof createClientStateHub>;
