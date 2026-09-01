/**
 * Client state hub: subscribe lifecycle against a fake connection — pushed
 * snapshots merge + broadcast, connection death flags stale, old servers
 * flip `supported`, persistence round-trips, and re-attach after reconnect
 * works while double-attach on the same link is a no-op.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createClientStateHub,
  type HubConnection,
} from "./stateHub";

type ChannelHandler = (event: string, data: unknown) => void;

function fakeConnection(connectionId: string) {
  const handlers = new Map<number, ChannelHandler>();
  let nextChannel = 1;
  const calls: Array<{ method: string; params?: Record<string, unknown> }> = [];
  let subscribeError: string | null = null;
  const conn: HubConnection = {
    connectionId,
    client: {
      openChannel: (handler) => {
        const id = nextChannel++;
        handlers.set(id, handler);
        return id;
      },
      call: (method, params) => {
        calls.push({ method, params });
        if (subscribeError) return Promise.reject(new Error(subscribeError));
        return Promise.resolve(null);
      },
    },
  };
  return {
    conn,
    calls,
    setSubscribeError: (e: string | null) => {
      subscribeError = e;
    },
    push: (channel: number, event: string, data: unknown) =>
      handlers.get(channel)?.(event, data),
    lastChannel: () => nextChannel - 1,
  };
}

function harness(storeFile: string | null = null) {
  const events: unknown[] = [];
  const hub = createClientStateHub({
    emit: (_event, payload) => events.push(payload),
    storeFile,
    persistDebounceMs: 10,
  });
  return { hub, events };
}

const SNAP = {
  domain: "ports",
  data: [{ port: 80 }],
  collectedAt: 111,
  stale: false,
  error: null,
};

afterEach(() => {
  vi.useRealTimers();
});

describe("client state hub", () => {
  it("subscribes on attach and mirrors pushed snapshots", async () => {
    const h = harness();
    const f = fakeConnection("root@h1");
    await h.hub.attach(f.conn);
    expect(f.calls[0]).toMatchObject({ method: "state.subscribe" });

    f.push(f.lastChannel(), "state", SNAP);
    const state = await h.hub.getState("root@h1");
    expect(state.domains.ports.data).toEqual([{ port: 80 }]);
    expect(state.domains.ports.stale).toBe(false);
    expect(h.events.length).toBeGreaterThan(0);
  });

  it("re-attaching the SAME link is a no-op; a new link re-subscribes", async () => {
    const h = harness();
    const f = fakeConnection("root@h1");
    await h.hub.attach(f.conn);
    await h.hub.attach(f.conn);
    expect(f.calls.filter((c) => c.method === "state.subscribe")).toHaveLength(1);

    // Reconnect: connection dies, then a NEW connection appears.
    f.push(f.lastChannel(), "closed", { error: "ssh exited" });
    const f2 = fakeConnection("root@h1");
    await h.hub.attach(f2.conn);
    expect(f2.calls.filter((c) => c.method === "state.subscribe")).toHaveLength(1);
  });

  it("flags all domains stale when the connection closes, keeping data", async () => {
    const h = harness();
    const f = fakeConnection("root@h1");
    await h.hub.attach(f.conn);
    f.push(f.lastChannel(), "state", SNAP);
    f.push(f.lastChannel(), "closed", { error: "ssh exited" });
    const state = await h.hub.getState("root@h1");
    expect(state.domains.ports.stale).toBe(true);
    expect(state.domains.ports.data).toEqual([{ port: 80 }]);
  });

  it("marks old servers unsupported on unknown-method", async () => {
    const h = harness();
    const f = fakeConnection("root@h1");
    f.setSubscribeError("unknown method: state.subscribe");
    await h.hub.attach(f.conn);
    const state = await h.hub.getState("root@h1");
    expect(state.supported).toBe(false);
  });

  it("keeps supported=true on transient subscribe failures and allows retry", async () => {
    const h = harness();
    const f = fakeConnection("root@h1");
    f.setSubscribeError("ssh server connection closed");
    await h.hub.attach(f.conn);
    expect((await h.hub.getState("root@h1")).supported).toBe(true);

    f.setSubscribeError(null);
    await h.hub.attach(f.conn); // attachedClient was reset → retries
    expect(f.calls.filter((c) => c.method === "state.subscribe")).toHaveLength(2);
  });

  it("persists fresh snapshots and serves them stale after an app restart", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "termco-cs-")), "state.json");
    const a = harness(file);
    const f = fakeConnection("root@h1");
    await a.hub.attach(f.conn);
    f.push(f.lastChannel(), "state", SNAP);
    await a.hub.persistNow();

    const b = harness(file);
    const state = await b.hub.getState("root@h1");
    expect(state.domains.ports.data).toEqual([{ port: 80 }]);
    expect(state.domains.ports.stale).toBe(true);
  });

  it("consumes a pending debounce when persistence is flushed explicitly", async () => {
    vi.useFakeTimers();
    const file = join(mkdtempSync(join(tmpdir(), "termco-cs-")), "state.json");
    const h = harness(file);
    const f = fakeConnection("root@h1");
    await h.hub.attach(f.conn);
    f.push(f.lastChannel(), "state", SNAP);
    expect(vi.getTimerCount()).toBe(1);

    await h.hub.persistNow();

    expect(vi.getTimerCount()).toBe(0);
  });
});
