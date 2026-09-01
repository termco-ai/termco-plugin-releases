/**
 * Small icon-only action button shown on hover within a rig row
 * (rename, add tab, delete).
 */

import { cn } from "../../ui";
import type { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * A compact hover action button. Stops click propagation so it never triggers
 * the surrounding row's activate/drag handlers. `destructive` tints it for
 * delete-style actions.
 */
export function RowAction({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Delete02Icon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors",
        destructive
          ? "hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} strokeWidth={1.75} />
    </button>
  );
}
