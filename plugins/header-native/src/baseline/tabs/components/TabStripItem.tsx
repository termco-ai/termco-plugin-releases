/**
 * One entry in the tab strip. Owns the pointer-drag gesture that reorders tabs,
 * the click/middle-click/double-click activation semantics, the inline rename
 * cell for terminal tabs, the right-click context menu, and the surrounding drop
 * indicators. All shared drag/rename/pill state lives in the parent `TabBar`;
 * this component reads it via props and reports gestures back through callbacks.
 */
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../ui";
import { TabsTrigger } from "../../ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../ui";
import { cn } from "../../ui";
import {
  Cancel01Icon,
  Copy01Icon,
  File01Icon,
  PencilEdit02Icon,
  PinIcon,
  PlusSignIcon,
  SidebarRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type Dispatch,
  Fragment,
  type RefObject,
  type SetStateAction,
} from "react";
import type { DragState } from "../lib/dragState";
import { labelFor } from "../../types";
import { isOverSplitZone, useSplitDrag } from "../lib/useSplitDrag";
import type { BulkCloseMode, EditorTab, Tab } from "../../types";
import { DropIndicator } from "./DropIndicator";
import { TabIcon } from "./TabIcon";
import { TabLanguageMenu } from "./TabLanguageMenu";
import { TabRenameInput } from "./TabRenameInput";

type TabStripItemProps = {
  tab: Tab;
  index: number;
  tabCount: number;
  activeId: number;
  isNew: boolean;
  compact?: boolean;
  srcIndex: number;
  draggingId: number | null;
  dropGap: number | null;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  dragRef: RefObject<DragState | null>;
  setDraggingId: (id: number | null) => void;
  setDropGap: (gap: number | null) => void;
  gapAtX: (clientX: number) => number;
  endDrag: (currentTarget: HTMLElement) => void;
  showAllLanguages: boolean;
  setShowAllLanguages: Dispatch<SetStateAction<boolean>>;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  onCloseMany: (anchorId: number, mode: BulkCloseMode) => void;
  onNewTabRight: (anchorId: number) => void;
  onDuplicate: (id: number) => void;
  onPin: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onReorder: (fromId: number, toGapIndex: number) => void;
  /** Open this tab in a split beside the current one (context menu / drag-to-edge). */
  onSplit?: (id: number) => void;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
};

/** Renders a single tab (with its drop indicators) in the tab strip. */
export function TabStripItem({
  tab: t,
  index: i,
  tabCount,
  activeId,
  isNew,
  compact,
  srcIndex,
  draggingId,
  dropGap,
  editingId,
  setEditingId,
  dragRef,
  setDraggingId,
  setDropGap,
  gapAtX,
  endDrag,
  showAllLanguages,
  setShowAllLanguages,
  onSelect,
  onClose,
  onCloseMany,
  onNewTabRight,
  onDuplicate,
  onPin,
  onRename,
  onReorder,
  onSplit,
  onOverrideLanguage,
}: TabStripItemProps) {
  const isPreview = t.kind === "editor" && (t as EditorTab).preview;
  const isActive = t.id === activeId;

  const showGap = (gap: number) =>
    draggingId !== null &&
    dropGap === gap &&
    gap !== srcIndex &&
    gap !== srcIndex + 1;

  // While renaming, render a non-button cell so the <input> is not
  // nested inside the trigger <button> (invalid HTML, and WebKit
  // blocks focus/selection on inputs inside buttons).
  if (editingId === t.id && t.kind === "terminal") {
    return (
      <Fragment key={t.id}>
        {showGap(i) && <DropIndicator />}
        <div
          data-tab-id={t.id}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent text-xs text-foreground",
            compact ? "px-1.5" : "px-2",
          )}
        >
          <TabIcon tab={t} />
          <TabRenameInput
            initial={labelFor(t)}
            onCommit={(value) => {
              onRename(t.id, value);
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        </div>
        {i === tabCount - 1 && showGap(tabCount) && <DropIndicator />}
      </Fragment>
    );
  }

  const trigger = (
    <TabsTrigger
      value={String(t.id)}
      data-tab-id={t.id}
      data-tab-active={isActive ? "true" : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        dragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          fromId: t.id,
          active: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const st = dragRef.current;
        if (!st || st.pointerId !== e.pointerId) return;
        if (!st.active) {
          if (Math.abs(e.clientX - st.startX) < 4) return;
          st.active = true;
          setDraggingId(st.fromId);
          document.body.style.userSelect = "none";
        }
        e.preventDefault();
        setDropGap(gapAtX(e.clientX));
        // Light up the workspace's split drop-zone only while hovering it.
        if (onSplit) {
          const over = isOverSplitZone(e.clientX, e.clientY);
          if (over !== useSplitDrag.getState().overSplit) {
            useSplitDrag.getState().setOverSplit(over);
          }
        }
      }}
      onPointerUp={(e) => {
        const st = dragRef.current;
        if (st?.active) {
          // Dropped over the workspace's right half → open in a split.
          if (onSplit && isOverSplitZone(e.clientX, e.clientY)) {
            onSplit(st.fromId);
          } else if (dropGap !== null) {
            onReorder(st.fromId, dropGap);
          }
        } else if (st && !st.active) {
          onSelect(t.id);
        }
        useSplitDrag.getState().setOverSplit(false);
        endDrag(e.currentTarget);
      }}
      onPointerCancel={(e) => endDrag(e.currentTarget)}
      onDoubleClick={() => isPreview && onPin(t.id)}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
          onClose(t.id);
        }
      }}
      // Suppress Radix's switch-on-mousedown so a tab grabbed to
      // drag (or a plain click) only activates on release.
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          return;
        }
        if (
          e.button === 0 &&
          !(e.target as HTMLElement).closest("[data-no-drag]")
        ) {
          e.preventDefault();
        }
      }}
      className={cn(
        "group relative z-[1] h-7 shrink-0 justify-between gap-1.5 rounded-md bg-transparent text-xs transition-colors data-active:bg-transparent dark:data-active:bg-transparent",
        isNew && "termco-tab-in",
        isActive
          ? "text-primary dark:text-primary"
          : "text-muted-foreground hover:text-foreground/80 dark:text-muted-foreground",
        draggingId === t.id && "opacity-50",
        compact ? "px-1.5!" : tabCount === 1 ? "px-2!" : "ps-2! pe-1!",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          // Container names (often long compose-style ids) get a tighter cap so
          // they don't dominate the strip; other tabs keep the roomier width.
          t.kind === "container"
            ? "max-w-32"
            : compact
              ? "max-w-48"
              : "max-w-80",
        )}
      >
        {t.kind === "editor" ? (
          <TabLanguageMenu
            tab={t}
            showAllLanguages={showAllLanguages}
            setShowAllLanguages={setShowAllLanguages}
            onOverrideLanguage={onOverrideLanguage}
          />
        ) : (
          <TabIcon tab={t} />
        )}
        {/* Preview tabs use italic to signal the transient state, matching the
            VSCode convention. A short-delay tooltip reveals the full name on
            hover — useful when the label is truncated (e.g. container tabs). */}
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <span className={cn("truncate", isPreview && "italic")}>
              {labelFor(t)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{labelFor(t)}</TooltipContent>
        </Tooltip>
        {t.kind === "editor" && t.dirty ? (
          <span
            aria-label="Unsaved changes"
            className="size-1.5 shrink-0 rounded-full bg-foreground/70"
          />
        ) : null}
      </span>
      <span
        role="button"
        aria-label="Close tab"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          onClose(t.id);
        }}
        className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
      </span>
    </TabsTrigger>
  );

  // Chrome-style menu, scoped to this tab's position in the strip.
  const hasRight = i < tabCount - 1;
  const hasLeft = i > 0;
  const itemClass = "gap-2 rounded-sm px-2.5 py-1.5 text-sm";
  const iconEl = (icon: typeof Cancel01Icon) => (
    <HugeiconsIcon icon={icon} size={13} strokeWidth={1.75} />
  );
  const tabPath = "path" in t ? (t.path as string) : undefined;
  const canDuplicate =
    t.kind === "terminal" ||
    t.kind === "editor" ||
    t.kind === "markdown" ||
    t.kind === "preview";
  const isPreviewEditor = t.kind === "editor" && (t as EditorTab).preview;

  const tabNode = (
    <ContextMenu>
      <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-48 p-1"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ContextMenuItem
          className={itemClass}
          onSelect={() => onNewTabRight(t.id)}
        >
          {iconEl(PlusSignIcon)}
          <span className="flex-1">New Tab to the Right</span>
        </ContextMenuItem>
        {onSplit && (
          <ContextMenuItem className={itemClass} onSelect={() => onSplit(t.id)}>
            {iconEl(SidebarRight01Icon)}
            <span className="flex-1">Open to the Side</span>
          </ContextMenuItem>
        )}
        {canDuplicate && (
          <ContextMenuItem
            className={itemClass}
            onSelect={() => onDuplicate(t.id)}
          >
            {iconEl(Copy01Icon)}
            <span className="flex-1">Duplicate</span>
          </ContextMenuItem>
        )}

        {(isPreviewEditor || t.kind === "terminal" || tabPath) && (
          <ContextMenuSeparator />
        )}
        {isPreviewEditor && (
          <ContextMenuItem className={itemClass} onSelect={() => onPin(t.id)}>
            {iconEl(PinIcon)}
            <span className="flex-1">Keep Open</span>
          </ContextMenuItem>
        )}
        {t.kind === "terminal" && (
          <ContextMenuItem
            className={itemClass}
            onSelect={() => setEditingId(t.id)}
          >
            {iconEl(PencilEdit02Icon)}
            <span className="flex-1">Rename</span>
          </ContextMenuItem>
        )}
        {tabPath && (
          <ContextMenuItem
            className={itemClass}
            onSelect={() => void navigator.clipboard?.writeText(tabPath)}
          >
            {iconEl(File01Icon)}
            <span className="flex-1">Copy Path</span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />
        <ContextMenuItem className={itemClass} onSelect={() => onClose(t.id)}>
          {iconEl(Cancel01Icon)}
          <span className="flex-1">Close</span>
        </ContextMenuItem>
        <ContextMenuItem
          className={itemClass}
          disabled={tabCount <= 1}
          onSelect={() => onCloseMany(t.id, "others")}
        >
          <span className="flex-1">Close Others</span>
        </ContextMenuItem>
        <ContextMenuItem
          className={itemClass}
          disabled={!hasRight}
          onSelect={() => onCloseMany(t.id, "right")}
        >
          <span className="flex-1">Close to the Right</span>
        </ContextMenuItem>
        <ContextMenuItem
          className={itemClass}
          disabled={!hasLeft}
          onSelect={() => onCloseMany(t.id, "left")}
        >
          <span className="flex-1">Close to the Left</span>
        </ContextMenuItem>
        <ContextMenuItem
          className={itemClass}
          onSelect={() => onCloseMany(t.id, "all")}
        >
          <span className="flex-1">Close All</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  return (
    <Fragment key={t.id}>
      {showGap(i) && <DropIndicator />}
      {tabNode}
      {i === tabCount - 1 && showGap(tabCount) && <DropIndicator />}
    </Fragment>
  );
}
