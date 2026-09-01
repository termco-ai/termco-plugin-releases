/**
 * User overrides for saved history sessions — a custom title and/or an archived
 * flag, keyed by `<backend>:<sessionId>`. Backend transcripts are read-only, so
 * rename/archive cannot mutate them; instead we keep a tiny
 * sidecar in `<userData>/coding-agents/session-meta.json` and apply it when the
 * history browser lists sessions.
 *
 * Pure over injected `read`/`write` fs seams (unit-tested without disk); index.ts
 * wires the real fs.
 */

export type SessionMetaEntry = { title?: string; archived?: boolean };

export type SessionMetaDeps = {
  read: () => string | null;
  write: (text: string) => void;
};

export type SessionMetaStore = ReturnType<typeof createSessionMetaStore>;

/** Sidecar key for a session (stable across renames). */
export function sessionMetaKey(backend: string, sessionId: string): string {
  return `${backend}:${sessionId}`;
}

export function createSessionMetaStore(deps: SessionMetaDeps) {
  let entries: Record<string, SessionMetaEntry> = {};

  function load(): void {
    let text: string | null = null;
    try {
      text = deps.read();
    } catch {
      text = null;
    }
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") entries = parsed;
    } catch {
      /* corrupt — start clean */
    }
  }

  function persist(): void {
    try {
      deps.write(JSON.stringify(entries));
    } catch {
      /* best-effort */
    }
  }

  /** Merge a patch for one session; a `title` of "" clears the custom title. */
  function set(key: string, patch: SessionMetaEntry): void {
    const prev = entries[key] ?? {};
    const next: SessionMetaEntry = { ...prev };
    if (patch.title !== undefined) {
      const t = patch.title.trim();
      if (t) next.title = t.slice(0, 200);
      else delete next.title;
    }
    if (patch.archived !== undefined) {
      if (patch.archived) next.archived = true;
      else delete next.archived;
    }
    if (next.title === undefined && !next.archived) delete entries[key];
    else entries[key] = next;
    persist();
  }

  function get(key: string): SessionMetaEntry | undefined {
    return entries[key];
  }

  function all(): Record<string, SessionMetaEntry> {
    return entries;
  }

  return { load, set, get, all };
}
// Owned by the coding-agent-native provider plugin.
