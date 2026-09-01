import type { AiLiveContributionCapability } from "@termco/ai-live-base";
import type { BrowserTabsCapability } from "@termco/browser-base";

export function contributeBrowserAiLive(
  contributions: AiLiveContributionCapability,
  tabs: BrowserTabsCapability,
): () => void {
  return contributions.contribute({
    openPreview: (url) => tabs.open(url) >= 0,
    getBrowserTabId: (rigId) => tabs.active(rigId),
    openBrowser: (url, rigId) => tabs.open(url, rigId),
    listBrowserTabs: (rigId) => tabs.list(rigId),
    switchBrowserTab: (id) => tabs.select(id),
    closeBrowserTab: (id) => tabs.close(id),
  });
}
