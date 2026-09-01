/**
 * The application chrome: two stacked rows. The title bar hosts the leading
 * controls, the inline rig (workspace) tab strip with its management
 * popover, the centered inline search, and the trailing cluster (notification
 * bell, AI panel toggle, settings, custom window controls). The pane strip
 * below hosts the tab bar for the active rig. Collapses to a compact layout
 * via {@link useHeaderCompact}.
 */

import { Button } from "../../ui";
import { WindowControls } from "./WindowControls";
import { cn } from "../../ui";
import { NotificationBell } from "../../agents/NotificationBell";
import type { BulkCloseMode, HeaderRuntime, Tab } from "../../types";
import { TabBar } from "../../tabs/TabBar";
import {
  AiNetworkIcon,
  FloppyDiskIcon,
  Settings01Icon,
  SidebarRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, type RefObject, useCallback } from "react";
import { useHeaderCompact } from "../hooks/useHeaderCompact";
import type { SearchInlineHandle, SearchTarget } from "../types";
import { HeaderLeadingControls } from "./HeaderLeadingControls";
import { SearchInline } from "./SearchInline";

type Props = {
  runtime: HeaderRuntime;
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewBlock: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  /** Chrome-style bulk close relative to a tab (others / right / left / all). */
  onCloseMany: (anchorId: number, mode: BulkCloseMode) => void;
  /** Open a fresh terminal tab to the right of the given tab. */
  onNewTabRight: (anchorId: number) => void;
  /** Duplicate the given tab into a new adjacent tab. */
  onDuplicate: (id: number) => void;
  /** Promote a preview (transient) tab to persistent. */
  onPin: (id: number) => void;
  /** Set a terminal tab's custom label; empty string resets to default. */
  onRename: (id: number, title: string) => void;
  /** Move a dragged tab to a new position (insertion gap index). */
  onReorder: (fromId: number, toGapIndex: number) => void;
  /** Open a tab in a split beside the current one. */
  onSplit?: (id: number) => void;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
  onToggleSidebar: () => void;
  onActivateAgent: (tabId: number, leafId: number) => void;
  onActivateLocalAgent: () => void;
  onOpenSettings: () => void;
  aiPanelOpen: boolean;
  onToggleAiPanel: () => void;
  agentsViewOpen: boolean;
  onToggleAgentsView: () => void;
  /** True while the full-window settings view owns the workspace body. */
  settingsViewOpen: boolean;
  /** The active editor tab has unsaved changes — shows the Save button. */
  editorDirty?: boolean;
  /** Persist the active editor's buffer (same as ⌘S). */
  onSaveFile?: () => void;
  rigSwitcher: ReactNode;
  rigTabStrip: ReactNode;
  searchTarget: SearchTarget;
  searchRef: RefObject<SearchInlineHandle | null>;
};

export function Header({
  runtime,
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewBlock,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onClose,
  onCloseMany,
  onNewTabRight,
  onDuplicate,
  onPin,
  onRename,
  onReorder,
  onSplit,
  onOverrideLanguage,
  onToggleSidebar,
  onActivateAgent,
  onActivateLocalAgent,
  onOpenSettings,
  aiPanelOpen,
  onToggleAiPanel,
  agentsViewOpen,
  onToggleAgentsView,
  settingsViewOpen,
  editorDirty = false,
  onSaveFile,
  rigSwitcher,
  rigTabStrip,
  searchTarget,
  searchRef,
}: Props) {
  const { rootRef, compact } = useHeaderCompact();
  const rigs = runtime.rigs;
  // Agent rows say where they run ("rig · tab"); the header is the only place
  // that holds both halves.
  const locateAgent = useCallback(
    (tabId: number) => {
      const tab = runtime.allTabs.find((entry) => entry.id === tabId);
      if (!tab) return null;
      const rig = rigs.find((entry) => entry.id === tab.rigId);
      if (!rig) return tab.label || null;
      return tab.label ? `${rig.name} · ${tab.label}` : rig.name;
    },
    [tabs, rigs],
  );

  // Prominent save affordance: a filled primary button in the top-right
  // cluster, present only while the active editor has unsaved changes —
  // impossible to miss, gone the moment the file is saved.
  const saveButton =
    editorDirty && onSaveFile ? (
      <Button
        variant="default"
        size="sm"
        className="mr-1 shrink-0 gap-1.5"
        onClick={onSaveFile}
        title="Save file (⌘S)"
      >
        <HugeiconsIcon icon={FloppyDiskIcon} size={13} strokeWidth={2} />
        Save
      </Button>
    ) : null;

  const settingsButton = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground",
        settingsViewOpen &&
          "bg-primary/12 text-primary hover:bg-primary/16 hover:text-primary",
      )}
      onClick={onOpenSettings}
      title="Settings"
    >
      <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.75} />
    </Button>
  );

  const aiPanelButton = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground",
        aiPanelOpen &&
          "bg-primary/12 text-primary hover:bg-primary/16 hover:text-primary",
      )}
      onClick={onToggleAiPanel}
      title="Toggle AI panel (⌘I)"
    >
      <HugeiconsIcon icon={SidebarRight01Icon} size={15} strokeWidth={1.75} />
    </Button>
  );

  const agentsButton = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground",
        agentsViewOpen &&
          "bg-primary/12 text-primary hover:bg-primary/16 hover:text-primary",
      )}
      onClick={onToggleAgentsView}
      title="Agents & Snippets"
    >
      <HugeiconsIcon icon={AiNetworkIcon} size={15} strokeWidth={1.6} />
    </Button>
  );

  return (
    <div ref={rootRef} className="shrink-0 select-none">
      {/* Title bar: window controls, rig tabs, search, trailing cluster. */}
      <div
        data-drag-region
        className={`termco-chrome flex h-11 shrink-0 items-center gap-2 border-b border-[var(--hairline-strong)] ${
          runtime.platform === "macos" ? "pr-2 pl-20" : "pr-0 pl-2"
        }`}
      >
        <HeaderLeadingControls
          runtime={runtime}
          onToggleSidebar={onToggleSidebar}
          onActivateAgent={onActivateAgent}
          onActivateLocalAgent={onActivateLocalAgent}
          locateAgent={locateAgent}
        />

        <span className="h-5 w-px shrink-0 bg-border" />

        <div className="flex min-w-0 shrink items-center gap-1">
          {rigTabStrip}
          {rigSwitcher}
        </div>

        <div
          data-drag-region
          className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden"
        >
          <span className="hs-header-search">
            <SearchInline
              ref={searchRef}
              target={searchTarget}
              runtime={runtime}
              compact={compact}
            />
          </span>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {saveButton}
          {runtime.platform === "macos" && (
            <NotificationBell
              runtime={runtime}
              onActivate={onActivateAgent}
              onActivateLocal={onActivateLocalAgent}
              locate={locateAgent}
            />
          )}
          {aiPanelButton}
          {agentsButton}
          {settingsButton}
          {runtime.customWindowControls && (
            <>
              <span className="ml-1 h-5 w-px shrink-0 bg-border" />
              <WindowControls runtime={runtime} />
            </>
          )}
        </div>
      </div>

      {/* Pane strip: the active rig's tabs. Hidden while the agents or
          settings view owns the window — matches the comp's normal-mode
          gating. */}
      {!agentsViewOpen && !settingsViewOpen && (
        <div
          data-drag-region
          className="termco-toolbar flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-2"
        >
          <TabBar
            tabs={tabs}
            activeId={activeId}
            onSelect={onSelect}
            onNew={onNew}
            onNewBlock={onNewBlock}
            onNewPrivate={onNewPrivate}
            onNewPreview={onNewPreview}
            onNewEditor={onNewEditor}
            onNewGitGraph={onNewGitGraph}
            onClose={onClose}
            onCloseMany={onCloseMany}
            onNewTabRight={onNewTabRight}
            onDuplicate={onDuplicate}
            onPin={onPin}
            onRename={onRename}
            onReorder={onReorder}
            onSplit={onSplit}
            onOverrideLanguage={onOverrideLanguage}
            compact={compact}
          />
          <div data-drag-region className="h-full min-w-2 flex-1" />
        </div>
      )}
    </div>
  );
}
