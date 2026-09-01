/**
 * Pointer-driven drag-and-drop engine for the rig switcher.
 *
 * Owns the transient drag state (which item is being dragged, the current drop
 * target, and the floating overlay position) and exposes the pointer handlers
 * the row components attach. A drag only "activates" after the pointer moves
 * past a small threshold, so a plain click still falls through to activation.
 */

import { useRef, useState } from "react";
import type { RigMeta } from "../../types";
import type { DragState, DropTarget, Edge } from "../types";

type UseRigDragArgs = {
  rigs: readonly RigMeta[];
  onMoveTabToRig: (tabId: number, rigId: string) => void;
  onReorderTab: (
    tabId: number,
    targetTabId: number,
    edge: "top" | "bottom",
  ) => void;
  onReorderRigs: (orderedIds: string[]) => void;
};

/**
 * Wire up drag-and-drop for the switcher.
 *
 * @param rigs current ordered rigs, used to compute reorder results.
 * @param onMoveTabToRig commit callback for dropping a tab into a rig.
 * @param onReorderTab commit callback for reordering a tab relative to another.
 * @param onReorderRigs commit callback for reordering the rig list.
 * @returns the live drag/drop/overlay state plus pointer handlers to spread
 *   onto rig and tab rows.
 */
export function useRigDrag({
  rigs,
  onMoveTabToRig,
  onReorderTab,
  onReorderRigs,
}: UseRigDragArgs) {
  const drag = useRef<DragState | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [dragging, setDragging] = useState<{
    kind: "rig" | "tab";
    id: string | number;
  } | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number } | null>(null);

  const endDrag = (el: Element) => {
    const st = drag.current;
    if (st) el.releasePointerCapture?.(st.pointerId);
    drag.current = null;
    dropRef.current = null;
    setDragging(null);
    setDrop(null);
    setOverlay(null);
    document.body.style.userSelect = "";
  };

  const onPointerDown = (
    e: React.PointerEvent,
    kind: "rig" | "tab",
    id: string | number,
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      kind,
      id,
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    if (!st || st.pointerId !== e.pointerId) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 5) return;
      st.active = true;
      setDragging({ kind: st.kind, id: st.id });
      document.body.style.userSelect = "none";
    }
    e.preventDefault();
    setOverlay({ x: e.clientX, y: e.clientY });

    const hit = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-drop]");
    if (!hit) {
      dropRef.current = null;
      setDrop(null);
      return;
    }
    const rect = hit.getBoundingClientRect();
    const edge: Edge =
      e.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
    const kind = hit.getAttribute("data-drop");
    let next: DropTarget | null = null;
    if (st.kind === "rig") {
      if (kind === "rig") {
        const rigId = hit.getAttribute("data-rig-id");
        if (rigId && rigId !== st.id) next = { kind: "rig", rigId, edge };
      }
    } else if (kind === "tab") {
      const tabId = Number(hit.getAttribute("data-tab-id"));
      if (tabId !== st.id) next = { kind: "tab", tabId, edge };
    } else if (kind === "rig") {
      const rigId = hit.getAttribute("data-rig-id");
      if (rigId) next = { kind: "into-rig", rigId };
    }
    dropRef.current = next;
    setDrop(next);
  };

  const commit = () => {
    const st = drag.current;
    const dt = dropRef.current;
    if (!st?.active || !dt) return;
    if (st.kind === "rig" && dt.kind === "rig") {
      const without = rigs.map((s) => s.id).filter((id) => id !== st.id);
      let idx = without.indexOf(dt.rigId);
      if (idx < 0) return;
      if (dt.edge === "bottom") idx += 1;
      without.splice(idx, 0, st.id as string);
      onReorderRigs(without);
    } else if (st.kind === "tab") {
      if (dt.kind === "tab") onReorderTab(st.id as number, dt.tabId, dt.edge);
      else if (dt.kind === "into-rig")
        onMoveTabToRig(st.id as number, dt.rigId);
    }
  };

  const onPointerUp = (e: React.PointerEvent, onActivate?: () => void) => {
    const st = drag.current;
    if (st?.active) commit();
    else if (st) onActivate?.();
    endDrag(e.currentTarget);
  };

  return { dragging, drop, overlay, onPointerDown, onPointerMove, onPointerUp };
}
