import { WORKSPACE_SURFACE_ATTR } from "@termco/ui-shell-base";

let overSplit = false;
const listeners = new Set<() => void>();
const splitState = {
  get overSplit() {
    return overSplit;
  },
  setOverSplit(value: boolean) {
    if (overSplit === value) return;
    overSplit = value;
    for (const listener of listeners) listener();
  },
};

/** Plugin-local gesture state. The workspace marker is a public DOM layout
 * contract; no private tab store is shared across the boundary. */
export const useSplitDrag = {
  getState: () => splitState,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function isOverSplitZone(clientX: number, clientY: number): boolean {
  const element = document.querySelector<HTMLElement>(
    `[${WORKSPACE_SURFACE_ATTR}]`,
  );
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return (
    clientY >= rect.top &&
    clientY <= rect.bottom &&
    clientX >= rect.left + rect.width * 0.5 &&
    clientX <= rect.right
  );
}
