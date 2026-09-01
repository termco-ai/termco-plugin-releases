/**
 * Centered placeholder used for the pane's loading, error, and empty states.
 */
import type { ReactNode } from "react";

/** Vertically and horizontally centers its children within the pane body. */
export function CenterPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      {children}
    </div>
  );
}
