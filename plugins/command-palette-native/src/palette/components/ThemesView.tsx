// The theme-picker page of the palette: a "Back" row plus every builtin and
// custom theme, with a check mark on the active one.

import type { ThemeDefinition } from "@termco/ui-theme-base";
import { CommandGroup, CommandItem } from "../../ui";
import { ArrowTurnBackwardIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { StatusItem } from "./StatusItem";

/**
 * Render the themes list.
 *
 * @param themes Filtered, ranked themes to display.
 * @param themeId Id of the currently active theme (gets the check mark).
 * @param onExit Leave the themes page and return to the root palette.
 * @param onCommit Apply the theme with the given id and close the palette.
 */
export function ThemesView({
  themes,
  themeId,
  onExit,
  onCommit,
}: {
  themes: readonly ThemeDefinition[];
  themeId: string;
  onExit: () => void;
  onCommit: (id: string) => void;
}) {
  return (
    <CommandGroup heading="Themes">
      <CommandItem
        value="theme:back"
        onSelect={onExit}
        className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
      >
        <HugeiconsIcon
          icon={ArrowTurnBackwardIcon}
          size={14}
          strokeWidth={1.75}
        />
        <span>Back</span>
      </CommandItem>
      {themes.map((t) => (
        <CommandItem
          key={t.id}
          value={`theme:${t.id}`}
          onSelect={() => onCommit(t.id)}
          className="gap-3 rounded-lg! px-3 py-2 text-sm data-selected:bg-primary/10"
        >
          <span className="truncate">{t.name}</span>
          {t.id === themeId ? (
            <HugeiconsIcon
              icon={Tick02Icon}
              size={14}
              strokeWidth={2}
              className="ml-auto text-muted-foreground"
            />
          ) : null}
        </CommandItem>
      ))}
      {themes.length === 0 ? <StatusItem label="No themes" /> : null}
    </CommandGroup>
  );
}
