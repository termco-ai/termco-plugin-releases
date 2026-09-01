/**
 * Thin horizontal insertion marker rendered at the top or bottom edge of a
 * rig/tab row to preview where a dragged item will land.
 */

import { cn } from "../../ui";
import type { Edge } from "../types";

/** Renders the reorder insertion line on the given `edge` of its relative parent. */
export function DropLine({ edge }: { edge: Edge }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary",
        edge === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2",
      )}
    />
  );
}
