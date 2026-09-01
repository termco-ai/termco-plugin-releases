/**
 * Shared drag-and-drop types for the rig switcher.
 *
 * These describe the in-flight pointer drag (`DragState`), the resolved drop
 * intent under the pointer (`DropTarget`), and the vertical `Edge` a reorder
 * should snap to. Kept in one place so the switcher container, its drag hook,
 * and the row components all speak the same vocabulary.
 */

/** Which half of a drop row the pointer is over, deciding insert position. */
export type Edge = "top" | "bottom";

/**
 * Mutable state for a single active pointer drag, held in a ref.
 * `active` flips true only once the pointer moves past the drag threshold,
 * so a plain click is never mistaken for a drag.
 */
export type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  kind: "rig" | "tab";
  id: string | number;
  active: boolean;
};

/** The resolved drop intent under the pointer: reorder a rig/tab, or move a tab into a rig. */
export type DropTarget =
  | { kind: "rig"; rigId: string; edge: Edge }
  | { kind: "tab"; tabId: number; edge: Edge }
  | { kind: "into-rig"; rigId: string };
