/** Edge/corner drag handles that resize the floating mini-window. */

import { cn } from "@termco/ui";
import type { ResizeDir } from "../../lib/miniWindowGeometry";

const RESIZE_HANDLE_CLASS: Record<ResizeDir, string> = {
  n: "top-0 left-3 right-3 h-1.5 cursor-ns-resize",
  s: "bottom-0 left-3 right-3 h-1.5 cursor-ns-resize",
  w: "top-3 bottom-3 left-0 w-1.5 cursor-ew-resize",
  e: "top-3 bottom-3 right-0 w-1.5 cursor-ew-resize",
  nw: "top-0 left-0 size-3 cursor-nwse-resize",
  ne: "top-0 right-0 size-3 cursor-nesw-resize",
  sw: "bottom-0 left-0 size-3 cursor-nesw-resize",
  se: "bottom-0 right-0 size-3 cursor-nwse-resize",
};

export const RESIZE_DIRS: ResizeDir[] = [
  "n",
  "s",
  "w",
  "e",
  "nw",
  "ne",
  "sw",
  "se",
];

export function ResizeHandle({
  dir,
  onPointerDown,
}: {
  dir: ResizeDir;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      data-no-drag
      onPointerDown={onPointerDown}
      className={cn(
        "absolute z-50 touch-none select-none",
        RESIZE_HANDLE_CLASS[dir],
      )}
    />
  );
}
