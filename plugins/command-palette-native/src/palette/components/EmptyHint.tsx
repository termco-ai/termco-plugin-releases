// The centered empty state shown when a command query matches nothing,
// nudging the user toward the `?` search-modes help.

import { CommandIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** Render the "no commands found" placeholder for the commands view. */
export function EmptyHint() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <HugeiconsIcon icon={CommandIcon} size={18} strokeWidth={1.5} />
      <span>No commands found. Type ? to see search modes.</span>
    </div>
  );
}
