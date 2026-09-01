import type { BrowserTabsCapability } from "@termco/browser-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { TerminalBlockOpenPreview } from "@termco/terminal-base";
import { TERMINAL_BLOCK_EVENTS } from "@termco/terminal-base";

/** Route terminal block preview intents into the selected browser-tabs provider. */
export function installTerminalPreviewNavigation(
  events: ApplicationEventsCapability,
  tabs: BrowserTabsCapability,
): () => void {
  return events.subscribe(TERMINAL_BLOCK_EVENTS.openPreview, (payload) => {
    const { url } = payload as Partial<TerminalBlockOpenPreview>;
    if (typeof url !== "string" || !url) return;
    tabs.open(url);
  });
}
