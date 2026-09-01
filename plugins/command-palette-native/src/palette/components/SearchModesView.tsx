// The `?` help page: lists the available search sigils so the user can jump
// straight into history or content search.

import { CommandGroup, CommandItem } from "../../ui";
import { MODE_HINTS } from "../lib/mode";

/**
 * Render the search-modes hint list.
 *
 * @param onPick Invoked with a sigil to seed the query and enter that mode.
 */
export function SearchModesView({
  onPick,
}: {
  onPick: (sigil: string) => void;
}) {
  return (
    <CommandGroup heading="Search modes">
      {MODE_HINTS.map((hint) => (
        <CommandItem
          key={hint.sigil}
          value={`hint:${hint.sigil}`}
          onSelect={() => onPick(hint.sigil)}
          className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
        >
          <kbd className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {hint.sigil}
          </kbd>
          <span>{hint.label}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
