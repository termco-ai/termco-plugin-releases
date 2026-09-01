/**
 * "Always allow on this site" affordance for browser action approvals:
 * resolves the active session and the origin of the browser tab it drives,
 * then adds that origin to the session's allowlist so future actions on the
 * same site skip the approval card.
 */
import { useChatStore } from "../../store/chatStore";
import { allowCurrentBrowserOrigin } from "../../runtime/browserPolicy";

/** Names of the browser action tools that support per-origin always-allow. */
export const BROWSER_ACTION_TOOLS = new Set([
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_press_key",
  "browser_evaluate",
  "browser_network_body",
  "browser_select_option",
]);

/**
 * Allow the current browser page's origin for the active session. Returns the
 * origin allow-listed, or null if it couldn't be resolved (in which case the
 * caller should still approve the one-off action).
 */
export async function allowActiveBrowserOrigin(): Promise<string | null> {
  const state = useChatStore.getState();
  const sessionId = state.activeSessionId;
  if (!sessionId) return null;
  const rigId = state.sessions.find((s) => s.id === sessionId)?.rigId;
  const tabId = state.live.getBrowserTabId(rigId);
  if (tabId == null) return null;
  return allowCurrentBrowserOrigin(sessionId, tabId);
}
