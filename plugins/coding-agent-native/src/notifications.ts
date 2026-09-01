/**
 * OS notifications for background coding-agent activity (main process). When the
 * Termco window is unfocused and a run needs approval, finishes a turn, or
 * errors, we surface a native notification; clicking it focuses the window and
 * asks the renderer to open that run.
 *
 * The decision + message building are pure (tested); the Electron `Notification`
 * and window handling are injected so this module has no `electron` dependency.
 */

import type { AgentEvent } from "@termco/agents-base";

export type NotifyKind = "approval" | "done" | "error";

/** Which notification (if any) an event warrants. */
export function notifyKind(event: AgentEvent): NotifyKind | null {
  if (event.type === "approval-request") return "approval";
  if (event.type === "turn-end") return "done";
  if (event.type === "error" && event.fatal === true) return "error";
  return null;
}

/** Title/body for a notification kind. */
export function notificationText(
  kind: NotifyKind,
  runTitle: string,
): { title: string; body: string } {
  const title = runTitle.trim() || "Coding agent";
  switch (kind) {
    case "approval":
      return { title, body: "Needs your approval" };
    case "done":
      return { title, body: "Finished — waiting for you" };
    case "error":
      return { title, body: "Run errored" };
  }
}

export type NotifyDeps = {
  /** Show a notification; `onClick` focuses + opens the run. */
  notify: (n: { title: string; body: string; onClick: () => void }) => void;
  /** Focus the window and open the given run. */
  focusRun: (runId: string) => void;
  /** Whether the app window is currently focused (skip notifying if so). */
  isFocused: () => boolean;
};

/** Fire a notification for an event when appropriate. Returns true if shown. */
export function maybeNotify(
  deps: NotifyDeps,
  args: { event: AgentEvent; runId: string; runTitle: string },
): boolean {
  if (deps.isFocused()) return false;
  const kind = notifyKind(args.event);
  if (!kind) return false;
  const { title, body } = notificationText(kind, args.runTitle);
  deps.notify({ title, body, onClick: () => deps.focusRun(args.runId) });
  return true;
}
// Owned by the coding-agent-native provider plugin.
