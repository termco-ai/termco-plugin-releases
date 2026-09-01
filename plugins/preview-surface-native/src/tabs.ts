import type { BrowserTabsCapability } from "@termco/browser-base";
import type { WorkspaceTabRecord, WorkspaceTabsCapability } from "@termco/workspace-base";

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url || "preview";
  }
}

function previewTabs(tabs: WorkspaceTabsCapability): WorkspaceTabRecord[] {
  return tabs.snapshot().tabs.filter((tab) => tab.kind === "preview");
}

export function createBrowserTabsController(
  tabs: WorkspaceTabsCapability,
): BrowserTabsCapability {
  return {
    active(rigId) {
      const snapshot = tabs.snapshot();
      const activeId = snapshot.activeId;
      const previews = previewTabs(tabs);
      return previews.some(
        (tab) => tab.id === activeId && (!rigId || tab.rigId === rigId),
      )
        ? activeId
        : (previews.find((tab) => !rigId || tab.rigId === rigId)?.id ?? null);
    },
    open(url, requestedRigId) {
      const snapshot = tabs.snapshot();
      const [id] = tabs.allocate(1);
      const rigId =
        requestedRigId ??
        snapshot.tabs.find((tab) => tab.id === snapshot.activeId)?.rigId ??
        snapshot.activeRigIdForNewTabs;
      const record: WorkspaceTabRecord = {
        id,
        rigId,
        kind: "preview",
        title: titleFromUrl(url),
        data: { url },
      };
      const nextTabs = [...snapshot.tabs, record];
      if (!snapshot.initialized) {
        tabs.initialize({
          tabs: nextTabs,
          activeId: id,
          splitTabId: 0,
          activeRigIdForNewTabs: rigId,
        });
      } else if (snapshot.splitTabId !== 0 && snapshot.focusedPane === "right") {
        tabs.transition({ tabs: nextTabs, splitTabId: id });
      } else {
        tabs.transition({ tabs: nextTabs, activeId: id });
      }
      return id;
    },
    list(rigId) {
      return previewTabs(tabs)
        .filter((tab) => !rigId || tab.rigId === rigId)
        .map((tab) => ({
          id: tab.id,
          rigId: tab.rigId,
          url: typeof tab.data?.url === "string" ? tab.data.url : "",
          title: tab.title,
        }));
    },
    select(id) {
      if (!previewTabs(tabs).some((tab) => tab.id === id)) return false;
      tabs.transition({ activeId: id });
      return true;
    },
    close(id) {
      if (!previewTabs(tabs).some((tab) => tab.id === id)) return false;
      return tabs.close(id);
    },
  };
}
