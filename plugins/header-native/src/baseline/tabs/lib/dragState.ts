/**
 * Shared shape of the in-flight tab-drag gesture tracked by the tab bar. Held in
 * a ref (not state) so pointer-move handlers can mutate it without re-rendering;
 * `active` flips true only once the pointer passes the drag threshold.
 */
export type DragState = {
  pointerId: number;
  startX: number;
  startY?: number;
  fromId: number;
  active: boolean;
};
