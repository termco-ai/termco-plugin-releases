export type DockPosition = "left" | "right" | "top" | "bottom";
export type SnapTarget = DockPosition | "center" | null;

export function dockLayout(position: DockPosition): ["horizontal" | "vertical", "before" | "after"] {
  return [
    position === "left" || position === "right" ? "horizontal" : "vertical",
    position === "left" || position === "top" ? "before" : "after",
  ];
}

/** Shared geometry for tab-strip and pane-header docking gestures. Each
 * source owner supplies its surface rectangle and renders its own feedback. */
export function workspaceSnapTarget(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): SnapTarget {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  // Compare relative distances so the nearest edge wins in wide workspaces.
  const edges: [DockPosition, number][] = [["left", x], ["right", 1 - x], ["top", y], ["bottom", 1 - y]];
  const [position, distance] = edges.reduce((nearest, edge) => edge[1] < nearest[1] ? edge : nearest);
  return distance <= 0.3 ? position : "center";
}
