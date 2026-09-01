/**
 * Floating chip that follows the pointer during a drag, previewing the
 * rig (color dot) or tab (icon) being moved.
 */

import type { Tab } from "../../types";
import { TabIcon } from "../../tabs/components/TabIcon";

/**
 * The drag preview chip. Renders a `TabIcon` when a `tab` is supplied,
 * otherwise a colored dot using `color`; `label` is the display name.
 */
export function OverlayChip({
  tab,
  color,
  label,
}: {
  tab?: Tab;
  color?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-lg">
      {tab ? (
        <TabIcon tab={tab} />
      ) : (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="max-w-44 truncate font-medium">{label}</span>
    </div>
  );
}
