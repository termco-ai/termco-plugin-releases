import type { UiTabsRuntime } from "@termco/ui-tabs-base";

/** A pane focus changes only terminal-local leaf state. The shell already
 * selected the visible tab; selecting again here lets a retained hidden
 * terminal's stale DOM focus steal the active tab back across rigs. */
export function updateFocusedTerminalLeaf(
  runtime: Pick<UiTabsRuntime, "updateTab">,
  tabId: number,
  leafId: number,
): void {
  runtime.updateTab(tabId, { activeLeafId: leafId });
}
