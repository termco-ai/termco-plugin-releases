// One runnable command row in the commands view: icon, title, and a
// right-aligned label (disabled reason, custom trailing text, or shortcut).

import { CommandItem, CommandShortcut } from "../../ui";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PaletteItem } from "../types";

/**
 * Render a single command palette action.
 *
 * @param item The command to display.
 * @param shortcutLabel Resolved key label, or `null` when the command is
 *   unbound; overridden by `item.disabledReason`/`item.trailing` when present.
 * @param onRun Invoked when the row is selected.
 */
export function ActionItem({
  item,
  shortcutLabel,
  onRun,
}: {
  item: PaletteItem;
  shortcutLabel: string | null;
  onRun: () => void;
}) {
  const rightLabel = item.disabledReason ?? item.trailing ?? shortcutLabel;
  return (
    <CommandItem
      value={`cmd:${item.id}`}
      disabled={!!item.disabledReason}
      onSelect={onRun}
      className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
      data-plugin-owner={item.owner?.pluginId}
      data-plugin-generation={item.owner?.generation}
      data-contribution-service={item.owner ? "ui.commands" : undefined}
      data-contribution-key={item.owner?.key}
    >
      {item.icon ? (
        <HugeiconsIcon
          icon={item.icon as never}
          size={14}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
      ) : null}
      <span className="truncate">{item.title}</span>
      {rightLabel ? (
        <CommandShortcut
          className={
            item.disabledReason
              ? "font-mono text-xs normal-case tracking-normal"
              : "font-mono text-xs tracking-normal"
          }
        >
          {rightLabel}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  );
}
