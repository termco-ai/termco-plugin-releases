// The default palette page: ranked commands bucketed into their groups, or the
// empty-state hint when nothing matches the query.

import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import { CommandGroup } from "../../ui";
import { formatShortcut } from "../lib/formatShortcut";
import type { PaletteItem } from "../types";
import { ActionItem } from "./ActionItem";
import { EmptyHint } from "./EmptyHint";

/**
 * Display order for the built-in groups (the former COMMAND_GROUPS whitelist,
 * demoted to an ordering hint). Unknown groups — plugin contributions — render
 * AFTER these, alphabetically, instead of being silently dropped.
 */
const KNOWN_GROUP_ORDER = [
  "General",
  "Rigs",
  "Tabs",
  "Panes",
  "Git",
  "Search",
  "View",
  "Workflows",
  "AI",
] as const;

/** Groups present in `items`: known groups first (in KNOWN_GROUP_ORDER),
 * then unknown groups alphabetically. Exported for tests. */
function orderedGroups(items: PaletteItem[]): string[] {
  const present = new Set(items.map((i) => i.group));
  const known = KNOWN_GROUP_ORDER.filter((g) => present.has(g));
  const unknown = [...present]
    .filter((g) => !(KNOWN_GROUP_ORDER as readonly string[]).includes(g))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...unknown];
}

/**
 * Render the grouped command list.
 *
 * @param rankedCommands Commands already filtered and ordered for display.
 * @param userShortcuts The user's shortcut overrides, used to label each row.
 * @param onRun Invoked with the selected command.
 */
export function CommandsView({
  rankedCommands,
  shortcuts,
  onRun,
}: {
  rankedCommands: PaletteItem[];
  shortcuts: ShortcutRegistryCapability;
  onRun: (item: PaletteItem) => void;
}) {
  if (rankedCommands.length === 0) return <EmptyHint />;
  return (
    <>
      {orderedGroups(rankedCommands).map((group) => {
        const rows = rankedCommands.filter((a) => a.group === group);
        return (
          <CommandGroup key={group} heading={group}>
            {rows.map((item) => (
              <ActionItem
                key={item.id}
                item={item}
                shortcutLabel={formatShortcut(item.shortcutId, shortcuts)}
                onRun={() => onRun(item)}
              />
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
