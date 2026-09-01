import { SessionId, SessionRevision, type SessionHistoryCapability, type SessionListing } from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { buildSessionLineageRows, listAllSessions } from "./lineage";

function listing(id: string, parent?: string): SessionListing {
  return {
    sessionId: SessionId(id),
    createdAt: 1,
    updatedAt: 1,
    backend: "chat",
    fidelity: "full",
    revision: SessionRevision(1),
    health: "healthy",
    ...(parent ? { parentSessionId: SessionId(parent) } : {}),
  };
}

describe("session lineage rows", () => {
  it("loads every current catalog page so lineage is not silently truncated", async () => {
    const list = vi.fn(async ({ cursor }: { cursor?: string } = {}) => cursor
      ? { sessions: [listing("child", "root")], exhausted: true }
      : { sessions: [listing("root")], cursor: "page-2", exhausted: false });

    await expect(listAllSessions({ list } as unknown as SessionHistoryCapability, 1))
      .resolves.toEqual([listing("root"), listing("child", "root")]);
    expect(list).toHaveBeenNthCalledWith(1, { limit: 1 });
    expect(list).toHaveBeenNthCalledWith(2, { cursor: "page-2", limit: 1 });
  });

  it("orders children below their parent and reports accessible tree metadata", () => {
    const rows = buildSessionLineageRows([
      listing("child-b", "root"),
      listing("root"),
      listing("grandchild", "child-a"),
      listing("child-a", "root"),
    ]);

    expect(rows.map(({ session, depth, hasChildren }) => ({
      id: session.sessionId,
      depth,
      hasChildren,
    }))).toEqual([
      { id: "root", depth: 0, hasChildren: true },
      { id: "child-b", depth: 1, hasChildren: false },
      { id: "child-a", depth: 1, hasChildren: true },
      { id: "grandchild", depth: 2, hasChildren: false },
    ]);
  });

  it("keeps missing parents and cycles visible without recursing forever", () => {
    const rows = buildSessionLineageRows([
      listing("orphan", "not-loaded"),
      listing("cycle-a", "cycle-b"),
      listing("cycle-b", "cycle-a"),
    ]);

    expect(rows.map((row) => row.session.sessionId)).toEqual(["orphan", "cycle-a", "cycle-b"]);
    expect(rows[0]).toMatchObject({ depth: 0, parentMissing: true });
  });
});
