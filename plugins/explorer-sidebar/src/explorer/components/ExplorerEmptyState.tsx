/**
 * Placeholder shown by {@link FileExplorer} when no workspace root is open.
 */

import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** Centered no-workspace message with a folder glyph. */
export function ExplorerEmptyState() {
  return (
    <div className="termco-panel flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="termco-raised flex size-10 items-center justify-center rounded-lg border border-border/70 text-primary">
        <HugeiconsIcon icon={Folder01Icon} size={19} strokeWidth={1.7} />
      </span>
      <div>
        <div className="text-sm font-medium text-foreground">
          No workspace open
        </div>
        <div className="mt-1 max-w-48 text-xs leading-relaxed text-muted-foreground">
          Choose a folder or switch rigs to start exploring files.
        </div>
      </div>
    </div>
  );
}
