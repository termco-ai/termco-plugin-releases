import type {
  SessionEventExplanation,
  SessionId,
  SessionQueryCapability,
  TrajectoryRecord,
} from "@termco/session-base";

export async function explainTrajectoryRecord(
  query: SessionQueryCapability,
  sessionId: SessionId,
  record: TrajectoryRecord,
): Promise<SessionEventExplanation | null> {
  const source = record.sourceSeqs[0];
  return source === undefined ? null : query.explainEvent(sessionId, source);
}
