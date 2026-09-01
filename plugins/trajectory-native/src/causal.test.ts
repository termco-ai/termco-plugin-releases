import { SessionId, SessionSeq, type SessionQueryCapability, type TrajectoryRecord } from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { explainTrajectoryRecord } from "./causal";

describe("trajectory causal query", () => {
  it("queries the canonical source event through session.query", async () => {
    const explanation = { event: {}, sources: [], derived: [] };
    const query = { explainEvent: vi.fn(async () => explanation) } as unknown as SessionQueryCapability;
    const record = { sourceSeqs: [SessionSeq(4), SessionSeq(8)] } as unknown as TrajectoryRecord;

    await expect(explainTrajectoryRecord(query, SessionId("session-1"), record)).resolves.toBe(explanation);
    expect(query.explainEvent).toHaveBeenCalledWith(SessionId("session-1"), SessionSeq(4));
  });
});
