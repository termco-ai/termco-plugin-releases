/**
 * Bearer tokens for the app's MCP server. Two kinds:
 *
 *  - RUN tokens: minted when the app spawns a managed coding-agent run,
 *    bound to that run + its rig, held in memory only, released when the run
 *    ends. The tool call's rig is known by construction — no ambiguity.
 *  - USER tokens: created by the user to let an EXTERNAL agent (opencode, a
 *    hand-run CLI, …) drive the app. Persisted HASHED (sha256) — the
 *    plaintext exists only in the creation response, shown once. Optionally
 *    pinned to one rig; otherwise the rig is resolved from the caller's cwd.
 *
 * The store is pure over injected `read`/`write`/`hash`/`randomToken` seams, so
 * every rule is unit-tested without disk or crypto side effects.
 */

/** A minted user token, as persisted (never the plaintext). */
export type UserTokenRecord = {
  kind: "user";
  id: string;
  label: string;
  /** sha256 of the plaintext token (hex). */
  sha256: string;
  /** Pinned rig, or null = resolve from the caller's working directory. */
  rigId: string | null;
  /** Auto-approve non-catastrophic tool calls for this token (opt-in). */
  autoApprove: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
};

/** What a successful authentication resolves to. */
export type TokenIdentity =
  | { kind: "run"; token: string; runId: string; rigId: string; autoApprove: boolean }
  | {
      kind: "user";
      id: string;
      label: string;
      rigId: string | null;
      autoApprove: boolean;
    };

/** A row for the settings UI (never carries the hash or plaintext). */
export type UserTokenInfo = {
  id: string;
  label: string;
  rigId: string | null;
  autoApprove: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type TokenStoreDeps = {
  read: () => string | null;
  write: (text: string) => void;
  /** sha256 hex of the input (injected so tests stay pure). */
  hash: (input: string) => string;
  /** A fresh urlsafe token string (injected for determinism in tests). */
  randomToken: () => string;
  /** Clock (ms) — injected so lastUsedAt is deterministic in tests. */
  now: () => number;
};

/** Only bump `lastUsedAt` (and its disk write) at most this often per token. */
const LAST_USED_THROTTLE_MS = 60_000;

export function createTokenStore(deps: TokenStoreDeps) {
  /** runToken → identity (RAM only). */
  const runTokens = new Map<string, { runId: string; rigId: string; autoApprove: boolean }>();
  /** id → user record (mirrored to disk). */
  let userTokens = new Map<string, UserTokenRecord>();

  function load(): void {
    const text = safe(() => deps.read());
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return;
      const next = new Map<string, UserTokenRecord>();
      for (const r of parsed) {
        if (r && typeof r.id === "string" && typeof r.sha256 === "string") {
          next.set(r.id, {
            kind: "user",
            id: r.id,
            label: typeof r.label === "string" ? r.label : "",
            sha256: r.sha256,
            rigId: typeof r.rigId === "string" ? r.rigId : null,
            autoApprove: r.autoApprove === true,
            createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
            lastUsedAt: typeof r.lastUsedAt === "number" ? r.lastUsedAt : null,
            revoked: r.revoked === true,
          });
        }
      }
      userTokens = next;
    } catch {
      /* corrupt file — start empty */
    }
  }

  function persist(): void {
    safe(() => deps.write(JSON.stringify([...userTokens.values()])));
  }

  // ---- Run tokens -------------------------------------------------------

  /** Mint a run token bound to a run + rig. Returns the plaintext (spawn env).
   * `autoApprove` mirrors the run's permission posture (a bypass-mode run does
   * not double-prompt for MCP calls — except catastrophic ones). */
  function registerRunToken(runId: string, rigId: string, autoApprove = false): string {
    const token = deps.randomToken();
    runTokens.set(token, { runId, rigId, autoApprove });
    return token;
  }

  /** Drop every run token for a run (called when the run ends/aborts). */
  function releaseRunToken(runId: string): void {
    for (const [token, v] of runTokens) {
      if (v.runId === runId) runTokens.delete(token);
    }
  }

  // ---- User tokens ------------------------------------------------------

  /** Create a user token. Returns the ONE-TIME plaintext + the stored info. */
  function createUserToken(opts: {
    label: string;
    rigId?: string | null;
    autoApprove?: boolean;
  }): { token: string; info: UserTokenInfo } {
    const token = deps.randomToken();
    const id = `ut_${deps.hash(token).slice(0, 12)}`;
    const rec: UserTokenRecord = {
      kind: "user",
      id,
      label: opts.label.slice(0, 120) || "External agent",
      sha256: deps.hash(token),
      rigId: opts.rigId ?? null,
      autoApprove: opts.autoApprove === true,
      createdAt: deps.now(),
      lastUsedAt: null,
      revoked: false,
    };
    userTokens.set(id, rec);
    persist();
    return { token, info: toInfo(rec) };
  }

  /** Revoke a user token by id (idempotent). */
  function revokeUserToken(id: string): boolean {
    const rec = userTokens.get(id);
    if (!rec || rec.revoked) return false;
    rec.revoked = true;
    persist();
    return true;
  }

  /** Revoke every user token pinned to a rig (rig deleted). */
  function revokeTokensForRig(rigId: string): void {
    let changed = false;
    for (const rec of userTokens.values()) {
      if (rec.rigId === rigId && !rec.revoked) {
        rec.revoked = true;
        changed = true;
      }
    }
    if (changed) persist();
  }

  /** All non-revoked user tokens, for the settings list. */
  function listUserTokens(): UserTokenInfo[] {
    return [...userTokens.values()]
      .filter((r) => !r.revoked)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toInfo);
  }

  // ---- Authentication ---------------------------------------------------

  /** Resolve a bearer token to an identity, or null. Bumps `lastUsedAt`
   * (throttled) for user tokens as a side effect of a successful auth. */
  function authenticate(bearer: string | undefined): TokenIdentity | null {
    if (!bearer) return null;
    const run = runTokens.get(bearer);
    if (run) {
      return {
        kind: "run",
        token: bearer,
        runId: run.runId,
        rigId: run.rigId,
        autoApprove: run.autoApprove,
      };
    }
    const digest = deps.hash(bearer);
    for (const rec of userTokens.values()) {
      if (rec.revoked || rec.sha256 !== digest) continue;
      const t = deps.now();
      if (rec.lastUsedAt === null || t - rec.lastUsedAt >= LAST_USED_THROTTLE_MS) {
        rec.lastUsedAt = t;
        persist();
      }
      return {
        kind: "user",
        id: rec.id,
        label: rec.label,
        rigId: rec.rigId,
        autoApprove: rec.autoApprove,
      };
    }
    return null;
  }

  return {
    load,
    registerRunToken,
    releaseRunToken,
    createUserToken,
    revokeUserToken,
    revokeTokensForRig,
    listUserTokens,
    authenticate,
    /** test/introspection */
    _runTokenCount: () => runTokens.size,
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;

function toInfo(r: UserTokenRecord): UserTokenInfo {
  return {
    id: r.id,
    label: r.label,
    rigId: r.rigId,
    autoApprove: r.autoApprove,
    createdAt: r.createdAt,
    lastUsedAt: r.lastUsedAt,
  };
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
// Owned by the mcp-server-native provider plugin.
