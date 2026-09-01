// A single, non-selectable palette row used for inline status messages
// ("Searching...", "No matches", error text) across every search mode.

import { CommandItem } from "../../ui";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * Render a disabled palette row conveying a transient status.
 *
 * @param label Message to display.
 * @param tone `"muted"` (default) for neutral notes or `"error"` for failures,
 *   which adds a warning icon and destructive coloring.
 */
export function StatusItem({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "error";
}) {
  return (
    <CommandItem
      value={`status:${label}`}
      disabled
      className="gap-3 rounded-lg! px-3 py-2 text-sm font-normal"
    >
      {tone === "error" ? (
        <HugeiconsIcon
          icon={AlertCircleIcon}
          size={14}
          strokeWidth={1.75}
          className="text-destructive"
        />
      ) : null}
      <span
        className={
          tone === "error" ? "text-destructive" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </CommandItem>
  );
}
