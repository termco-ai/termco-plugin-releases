import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type {
  UiHeaderRuntime,
  UiHeaderSearchCapability,
} from "@termco/ui-header-base";
import type { WorkspaceRigOverviewCapability } from "@termco/workspace-base";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Header } from "./header/components/Header";
import type { SearchInlineHandle } from "./types";
import { RigSwitcher } from "./rigs/RigSwitcher";
import { RigTabStrip } from "./rigs/RigTabStrip";
import { TabSwitcherHud } from "./tabs/TabSwitcherHud";
import { useHeaderTabSwitcher } from "./tabs/lib/useHeaderTabSwitcher";

export function ExactHeader({
  runtime,
  rigOverview,
  headerSearch,
  shortcuts,
}: {
  runtime: UiHeaderRuntime;
  rigOverview: WorkspaceRigOverviewCapability;
  headerSearch: UiHeaderSearchCapability;
  shortcuts: ShortcutRegistryCapability;
}) {
  const searchRef = useRef<SearchInlineHandle>(null);
  const rigOverviewSnapshot = useSyncExternalStore(
    (listener) => rigOverview.subscribe(listener),
    () => rigOverview.snapshot(),
    () => rigOverview.snapshot(),
  );
  useEffect(() => {
    return headerSearch.register(() => searchRef.current?.focus());
  }, [headerSearch]);
  const tabSwitcher = useHeaderTabSwitcher({
    tabs: runtime.tabs,
    allTabs: runtime.allTabs,
    activeId: runtime.activeTabId,
    selectTab: runtime.selectTab,
    shortcuts,
  });

  return (
    <>
      <Header
      runtime={runtime}
      tabs={[...runtime.tabs]}
      activeId={runtime.activeTabId}
      onSelect={runtime.selectTab}
      onSplit={runtime.splitTab}
      onNew={runtime.newTab}
      onNewBlock={runtime.newBlockTab}
      onNewPrivate={runtime.newPrivateTab}
      onNewPreview={runtime.newPreviewTab}
      onNewEditor={runtime.newEditor}
      onNewGitGraph={runtime.newGitGraph}
      onClose={runtime.closeTab}
      onCloseMany={runtime.closeMany}
      onNewTabRight={runtime.newTabRightOf}
      onDuplicate={runtime.duplicateTab}
      onPin={runtime.pinTab}
      onRename={runtime.renameTab}
      onReorder={runtime.reorderTab}
      onOverrideLanguage={runtime.overrideLanguage}
      onToggleSidebar={runtime.toggleSidebar}
      onActivateAgent={runtime.activateAgent}
      onActivateLocalAgent={runtime.activateLocalAgent}
      onOpenSettings={runtime.toggleSettings}
      aiPanelOpen={runtime.aiPanelOpen}
      onToggleAiPanel={runtime.toggleAiPanel}
      agentsViewOpen={runtime.agentsViewOpen}
      onToggleAgentsView={runtime.toggleAgentsView}
      settingsViewOpen={runtime.settingsViewOpen}
      editorDirty={runtime.editorDirty}
      onSaveFile={runtime.saveActiveFile}
      rigTabStrip={
        <RigTabStrip
          runtime={runtime}
          onNewRig={runtime.newRig}
          onNewSshRig={runtime.newSshRig}
          onDeleteRig={runtime.deleteRig}
        />
      }
      rigSwitcher={
        <RigSwitcher
          runtime={runtime}
          open={rigOverviewSnapshot.open}
          onOpenChange={(open) => rigOverview.setOpen(open)}
          tabs={[...runtime.allTabs]}
          onNewRig={runtime.newRig}
          onNewSshRig={runtime.newSshRig}
          onDeleteRig={runtime.deleteRig}
          onNewTabInRig={runtime.newTabInRig}
          onJumpTab={runtime.jumpToTab}
          onCloseTab={runtime.closeTab}
          onMoveTabToRig={runtime.moveTabToRig}
          onReorderTab={runtime.reorderRigTab}
          onReorderRigs={runtime.reorderRigs}
        />
      }
      searchTarget={runtime.findTarget}
        searchRef={searchRef}
      />
      {tabSwitcher ? (
        <TabSwitcherHud tabs={runtime.tabs} state={tabSwitcher} />
      ) : null}
    </>
  );
}
