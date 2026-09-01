import { describe, expect, it } from "vitest";
import { createTokenStore, type TokenStoreDeps } from "./tokens";

/** Deterministic seams: sequential tokens, real-ish sha, controllable clock. */
function harness(initial: string | null = null) {
  let disk = initial;
  let clock = 1000;
  let seq = 0;
  const deps: TokenStoreDeps = {
    read: () => disk,
    write: (t) => {
      disk = t;
    },
    // A non-embedding fake hash — the real sha256 doesn't leak its input,
    // so neither may the fixture (the plaintext-not-on-disk assertion relies
    // on this).
    hash: (s) => `sha-${[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)}`,
    randomToken: () => `tok-${++seq}`,
    now: () => clock,
  };
  return {
    deps,
    disk: () => disk,
    advance: (ms: number) => {
      clock += ms;
    },
    setClock: (v: number) => {
      clock = v;
    },
  };
}

describe("run tokens", () => {
  it("authenticates to the run+rig, and releases with the run", () => {
    const h = harness();
    const store = createTokenStore(h.deps);
    const token = store.registerRunToken("run-1", "rig-A");
    expect(store.authenticate(token)).toEqual({
      kind: "run",
      token,
      runId: "run-1",
      rigId: "rig-A",
      autoApprove: false,
    });
    store.releaseRunToken("run-1");
    expect(store.authenticate(token)).toBeNull();
    expect(store._runTokenCount()).toBe(0);
  });
});

describe("user tokens", () => {
  it("persists HASHED (never the plaintext) and authenticates the plaintext", () => {
    const h = harness();
    const store = createTokenStore(h.deps);
    const { token, info } = store.createUserToken({ label: "opencode" });
    // Plaintext must not appear on disk; the hash must.
    expect(h.disk()).not.toContain(token);
    expect(h.disk()).toContain(h.deps.hash(token));
    expect(info.label).toBe("opencode");
    expect(store.authenticate(token)).toMatchObject({
      kind: "user",
      id: info.id,
      rigId: null,
      autoApprove: false,
    });
  });

  it("honors rig pinning and autoApprove", () => {
    const store = createTokenStore(harness().deps);
    const { token } = store.createUserToken({
      label: "pinned",
      rigId: "rig-Z",
      autoApprove: true,
    });
    expect(store.authenticate(token)).toMatchObject({
      kind: "user",
      rigId: "rig-Z",
      autoApprove: true,
    });
  });

  it("revokes a token immediately", () => {
    const store = createTokenStore(harness().deps);
    const { token, info } = store.createUserToken({ label: "x" });
    expect(store.revokeUserToken(info.id)).toBe(true);
    expect(store.authenticate(token)).toBeNull();
    // idempotent
    expect(store.revokeUserToken(info.id)).toBe(false);
    expect(store.listUserTokens()).toEqual([]);
  });

  it("revokes every token pinned to a deleted rig", () => {
    const store = createTokenStore(harness().deps);
    const a = store.createUserToken({ label: "a", rigId: "rig-1" });
    const b = store.createUserToken({ label: "b", rigId: "rig-2" });
    store.revokeTokensForRig("rig-1");
    expect(store.authenticate(a.token)).toBeNull();
    expect(store.authenticate(b.token)).not.toBeNull();
  });

  it("throttles lastUsedAt writes to once per minute", () => {
    const h = harness();
    const store = createTokenStore(h.deps);
    const { token, info } = store.createUserToken({ label: "x" });
    h.setClock(100_000);
    store.authenticate(token);
    const afterFirst = h.disk();
    // Same minute → no new write (lastUsedAt unchanged).
    h.advance(30_000);
    store.authenticate(token);
    expect(h.disk()).toBe(afterFirst);
    // A minute later → lastUsedAt bumps + persists.
    h.advance(31_000);
    store.authenticate(token);
    expect(h.disk()).not.toBe(afterFirst);
    expect(store.listUserTokens()[0].id).toBe(info.id);
  });

  it("loads persisted tokens and tolerates a corrupt file", () => {
    const h = harness();
    const first = createTokenStore(h.deps);
    const { token } = first.createUserToken({ label: "persisted" });
    // A fresh store over the same disk authenticates the same token.
    const second = createTokenStore(h.deps);
    second.load();
    expect(second.authenticate(token)).not.toBeNull();
    // Corrupt file → empty, no throw.
    const corrupt = createTokenStore(harness("{not json").deps);
    expect(() => corrupt.load()).not.toThrow();
    expect(corrupt.listUserTokens()).toEqual([]);
  });

  it("rejects an unknown/garbage bearer", () => {
    const store = createTokenStore(harness().deps);
    expect(store.authenticate(undefined)).toBeNull();
    expect(store.authenticate("nope")).toBeNull();
  });
});
// Owned by the mcp-server-native provider plugin.
