import type { SessionHistoryCapability, SessionId } from "@termco/session-base";

/** The trajectory UI requests recovery; only the session history owner mutates the journal. */
export async function recoverSessionForContinuation(
  history: SessionHistoryCapability,
  sessionId: SessionId,
  refresh: () => Promise<void>,
): Promise<void> {
  await history.loadForContinuation(sessionId);
  await refresh();
}
