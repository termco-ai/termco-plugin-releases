/** Source-owned by the coding-agent-native plugin.
 * Decoupled "open this agent run's detail view" request (plugin-rewrite
 * Phase 6 — the trajectory view's Jump-to-run action). The dock's mode state
 * and the CodingAgentsPanel's screen state are both component-local, so the
 * request rides a tiny store both react to:
 *
 *  - AiDockPanel switches its mode to "agents" when a request appears;
 *  - CodingAgentsPanel (once mounted) opens the run's detail and consumes it.
 *
 * Requests expire after {@link PENDING_TTL_MS} so a stale one can never
 * navigate the panel minutes later.
 */
import { create } from "zustand";

const PENDING_TTL_MS = 10_000;

type PendingAgentRun = {
  pending: { runId: string; at: number } | null;
  request: (runId: string) => void;
  clear: () => void;
};

export const usePendingAgentRun = create<PendingAgentRun>((set) => ({
  pending: null,
  request: (runId) => set({ pending: { runId, at: Date.now() } }),
  clear: () => set({ pending: null }),
}));

/** The current pending run id, or null when none/expired. */
export function pendingAgentRunId(
  pending: { runId: string; at: number } | null,
): string | null {
  if (!pending) return null;
  return Date.now() - pending.at <= PENDING_TTL_MS ? pending.runId : null;
}

/** Ask the app to surface an agent run's detail view (dock → agents mode). */
export function requestAgentRunDetail(runId: string): void {
  usePendingAgentRun.getState().request(runId);
}
