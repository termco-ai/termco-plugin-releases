/**
 * A single space entry in the switcher list: header row (avatar, name,
 * inline rename, hover actions) plus, when expanded, its child tab rows.
 */

import { cn } from "../../ui";
import type { RigMeta, Tab } from "../../types";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { accentFor } from "../lib/rigColor";
import type { DropTarget } from "../types";
import { DropLine } from "./DropLine";
import { InlineRename } from "./InlineRename";
import { RowAction } from "./RowAction";
import { RigAvatar } from "./RigAvatar";
import { TabRow } from "./TabRow";

type RigRowProps = {
  rig: RigMeta;
  tabs: Tab[];
  isActive: boolean;
  canDelete: boolean;
  expanded: boolean;
  editing: boolean;
  dragging: { kind: "rig" | "tab"; id: string | number } | null;
  drop: DropTarget | null;
  draggingTabFromOther: boolean;
  onPointerDown: (
    e: React.PointerEvent,
    kind: "rig" | "tab",
    id: string | number,
  ) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, onActivate?: () => void) => void;
  onToggle: () => void;
  onSwitch: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onNewTab: () => void;
  onJumpTab: (id: number) => void;
  onCloseTab: (id: number) => void;
};

/**
 * Renders one space and (when expanded) its tabs. The header is a drag source
 * for reordering rigs and a drop target for moving tabs into this rig;
 * pointer handlers are supplied by the switcher's drag hook.
 */
export function RigRow({
  rig,
  tabs,
  isActive,
  canDelete,
  expanded,
  editing,
  dragging,
  drop,
  draggingTabFromOther,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onToggle,
  onSwitch,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onNewTab,
  onJumpTab,
  onCloseTab,
}: RigRowProps) {
  const isDragging = dragging?.kind === "rig" && dragging.id === rig.id;
  const moveTarget = drop?.kind === "into-rig" && drop.rigId === rig.id;
  const reorderEdge =
    drop?.kind === "rig" && drop.rigId === rig.id ? drop.edge : null;

  return (
    <div className={cn("relative", isDragging && "opacity-50")}>
      {reorderEdge && <DropLine edge={reorderEdge} />}
      {/* biome-ignore lint/a11y/useSemanticElements: drag row hosts nested buttons, cannot be a <button> */}
      <div
        data-onboarding-target="header.rig-row"
        data-drop="rig"
        data-rig-id={rig.id}
        role="button"
        tabIndex={editing ? -1 : 0}
        onPointerDown={
          editing ? undefined : (e) => onPointerDown(e, "rig", rig.id)
        }
        onPointerMove={onPointerMove}
        onPointerUp={editing ? undefined : (e) => onPointerUp(e, onSwitch)}
        onPointerCancel={(e) => onPointerUp(e)}
        onKeyDown={(e) => {
          if (editing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            onSwitch();
          }
        }}
        className={cn(
          "group relative flex cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
          moveTarget
            ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
            : isActive
              ? "bg-accent"
              : "hover:bg-accent/50",
        )}
      >
        {/* The active rig carries a spine in its own colour, so the current
            one is findable without reading any label. */}
        {isActive && !moveTarget ? (
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full"
            style={{ background: accentFor(rig) }}
          />
        ) : null}
        <button
          type="button"
          data-no-drag
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
        >
          <HugeiconsIcon
            icon={expanded ? ArrowDown01Icon : ArrowRight01Icon}
            size={13}
            strokeWidth={2}
          />
        </button>
        <RigAvatar rig={rig} size="sm" active={isActive} />
        {editing ? (
          <InlineRename
            initial={rig.name}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
            className="ml-0.5"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {rig.name}
          </span>
        )}
        {!editing && (
          <>
            <span className="shrink-0 px-1 text-xs tabular-nums text-muted-foreground/50 group-hover:hidden">
              {tabs.length}
            </span>
            <div
              data-no-drag
              className="hidden shrink-0 items-center gap-0.5 group-hover:flex"
            >
              <RowAction
                icon={PencilEdit02Icon}
                label="Rename rig"
                onClick={onStartRename}
              />
              <RowAction
                icon={PlusSignIcon}
                label="New tab"
                onClick={onNewTab}
              />
              {canDelete && (
                <RowAction
                  icon={Delete02Icon}
                  label="Delete rig"
                  destructive
                  onClick={onDelete}
                />
              )}
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-px py-0.5 pl-10 pr-0.5">
          {tabs.map((t) => (
            <TabRow
              key={t.id}
              tab={t}
              dragging={dragging}
              drop={drop}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onJump={() => onJumpTab(t.id)}
              onClose={() => onCloseTab(t.id)}
            />
          ))}
          {tabs.length === 0 && (
            <span className="px-2 py-1 text-xs text-muted-foreground/50">
              {draggingTabFromOther ? "Drop to move here" : "No tabs"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
