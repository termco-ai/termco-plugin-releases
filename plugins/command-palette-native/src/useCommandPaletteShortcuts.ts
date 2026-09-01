import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import type { UiCommandPaletteCapability } from "@termco/ui-overlays-base";
import { useMemo } from "react";

/** The command palette owns the shortcuts that open its own modes. */
export function useCommandPaletteShortcuts(
  palette: UiCommandPaletteCapability,
  shortcuts: ShortcutRegistryCapability,
): void {
  const handlers = useMemo(
    () => ({
      "commandPalette.open": () => palette.show("commands"),
      "commandPalette.content": () => palette.show("content"),
    }),
    [palette],
  );
  shortcuts.useHandlers(handlers);
}
