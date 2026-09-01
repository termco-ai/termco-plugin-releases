/**
 * A single tab entry inside an expanded rig row: draggable, keyboard
 * activatable, with a hover close button and an optional subtitle.
 */

import { cn } from "../../ui";
import { labelFor, type Tab } from "../../types";
import { TabIcon } from "../../tabs/components/TabIcon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { subtitleFor } from "../lib/subtitleFor";
import type { DropTarget } from "../types";
import { DropLine } from "./DropLine";

/**
 * Renders one tab row. Pointer handlers are threaded in from the switcher's
 * drag hook so a drag reorders/moves the tab while a plain click jumps to it.
 */
export function TabRow({
  tab,
  dragging,
  drop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onJump,
  onClose,
}: {
  tab: Tab;
  dragging: { kind: "rig" | "tab"; id: string | number } | null;
  drop: DropTarget | null;
  onPointerDown: (
    e: React.PointerEvent,
    kind: "rig" | "tab",
    id: string | number,
  ) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, onActivate?: () => void) => void;
  onJump: () => void;
  onClose: () => void;
}) {
  const subtitle = subtitleFor(tab);
  const isDragging = dragging?.kind === "tab" && dragging.id === tab.id;
  const reorderEdge =
    drop?.kind === "tab" && drop.tabId === tab.id ? drop.edge : null;

  return (
    <div className="relative">
      {reorderEdge && <DropLine edge={reorderEdge} />}
      {/* biome-ignore lint/a11y/useSemanticElements: drag row hosts a nested close button, cannot be a <button> */}
      <div
        data-drop="tab"
        data-tab-id={tab.id}
        role="button"
        tabIndex={0}
        onPointerDown={(e) => onPointerDown(e, "tab", tab.id)}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e, onJump)}
        onPointerCancel={(e) => onPointerUp(e)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onJump();
          }
        }}
        className={cn(
          "group/tab relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary/40",
          isDragging && "opacity-50",
        )}
      >
        <TabIcon tab={tab} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs leading-tight">
            {labelFor(tab)}
          </span>
          {subtitle && (
            <span className="truncate text-xs leading-tight text-muted-foreground/55">
              {subtitle}
            </span>
          )}
        </span>
        <button
          type="button"
          data-no-drag
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close tab"
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/tab:opacity-70 hover:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
