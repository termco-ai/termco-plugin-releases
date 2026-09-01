import type { SessionHistoryCapability, SessionListing } from "@termco/session-base";

export interface SessionLineageRow {
  readonly session: SessionListing;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly parentMissing: boolean;
}

/** Reads the complete current session catalog through its cursor contract. */
export async function listAllSessions(
  history: Pick<SessionHistoryCapability, "list">,
  pageSize = 200,
): Promise<readonly SessionListing[]> {
  const sessions: SessionListing[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await history.list({
      ...(cursor ? { cursor } : {}),
      limit: pageSize,
    });
    sessions.push(...page.sessions);
    if (page.exhausted) break;
    if (!page.cursor || seenCursors.has(page.cursor)) {
      throw new Error("Session catalog pagination did not advance");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  } while (true);
  return Object.freeze(sessions);
}

/** Builds a cycle-safe presentation tree from the current session catalog. */
export function buildSessionLineageRows(
  sessions: readonly SessionListing[],
): readonly SessionLineageRow[] {
  const byId = new Map(sessions.map((session) => [String(session.sessionId), session]));
  const children = new Map<string, SessionListing[]>();
  for (const session of sessions) {
    if (!session.parentSessionId || !byId.has(String(session.parentSessionId))) continue;
    const parentId = String(session.parentSessionId);
    const group = children.get(parentId) ?? [];
    group.push(session);
    children.set(parentId, group);
  }

  const rows: SessionLineageRow[] = [];
  const visited = new Set<string>();
  const append = (session: SessionListing, depth: number) => {
    const id = String(session.sessionId);
    if (visited.has(id)) return;
    visited.add(id);
    rows.push({
      session,
      depth,
      hasChildren: (children.get(id)?.length ?? 0) > 0,
      parentMissing: Boolean(session.parentSessionId && !byId.has(String(session.parentSessionId))),
    });
    for (const child of children.get(id) ?? []) append(child, depth + 1);
  };

  for (const session of sessions) {
    if (!session.parentSessionId || !byId.has(String(session.parentSessionId))) append(session, 0);
  }
  for (const session of sessions) append(session, 0);
  return Object.freeze(rows);
}
