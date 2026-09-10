import { cn } from "../../ui";
import { DOCK_LABELS, type DockPosition, type SnapTarget } from "../lib/useSplitDrag";
import { DockPreview } from "./TabLayoutMenu";

const regions: Record<DockPosition, string> = {
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
};

export function TabSnapOverlay({ target }: { target: NonNullable<SnapTarget> }) {
  return (
    <div aria-hidden data-termco-overlay="true" className="pointer-events-none absolute inset-0 z-50">
      {target !== "center" && (
        <div data-testid="tab-split-drop-indicator" data-dock-position={target}
          className={cn("absolute rounded-md border-2 border-primary/60 bg-primary/10", regions[target])} />
      )}
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-3 text-popover-foreground shadow-lg">
        {target !== "center" && <DockPreview position={target} />}
        <span className="whitespace-nowrap text-xs font-medium">
          {target === "center" ? "Drag to an edge to place tab" : `Release to place ${DOCK_LABELS[target].toLowerCase()}`}
        </span>
      </div>
    </div>
  );
}
