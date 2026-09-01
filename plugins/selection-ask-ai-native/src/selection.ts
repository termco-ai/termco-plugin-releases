import type { EditorSessionsCapability } from "@termco/editor-base";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";

export type CapturedSelection = {
  text: string;
  source: "terminal" | "editor";
};

export function captureActiveSelection(
  tabs: WorkspaceTabsCapability,
  terminals?: TerminalSessionsCapability,
  editors?: EditorSessionsCapability,
): CapturedSelection | null {
  const snapshot = tabs.snapshot();
  const focusedId =
    snapshot.focusedPane === "right" && snapshot.splitTabId !== 0
      ? snapshot.splitTabId
      : snapshot.activeId;
  const tab = snapshot.tabs.find((candidate) => candidate.id === focusedId);
  if (!tab) return null;
  let text: string | null = null;
  if (
    tab.kind === "terminal" &&
    typeof tab.data?.activeLeafId === "number"
  ) {
    text = terminals?.selection(tab.data.activeLeafId) ?? null;
  } else if (tab.kind === "editor") {
    text = editors?.selection(tab.id) ?? null;
  }
  return text?.trim() ? { text, source: tab.kind as "terminal" | "editor" } : null;
}
