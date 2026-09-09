import { WORKSPACE_SURFACE_ATTR, workspaceSnapTarget, type DockPosition, type SnapTarget } from "@termco/ui-shell-base";
export { dockLayout, type DockPosition, type SnapTarget } from "@termco/ui-shell-base";

export const DOCK_POSITIONS: readonly DockPosition[] = ["left", "right", "top", "bottom"];
export const DOCK_LABELS: Record<DockPosition, string> = {
  left: "Left", right: "Right", top: "Above", bottom: "Below",
};

let target: SnapTarget = null;
const listeners = new Set<() => void>();
const splitState = {
  get target() { return target; },
  setTarget(value: SnapTarget) {
    if (target === value) return;
    target = value;
    for (const listener of listeners) listener();
  },
};

/** Gesture state belongs to the header; the workspace marker is a public
 * DOM contract, so the header never imports the shell's private layout. */
export const useSplitDrag = {
  getState: () => splitState,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function getSnapTarget(clientX: number, clientY: number): SnapTarget {
  const element = document.querySelector<HTMLElement>(`[${WORKSPACE_SURFACE_ATTR}]`);
  if (!element) return null;
  return workspaceSnapTarget(element.getBoundingClientRect(), clientX, clientY);
}
