import { useSyncExternalStore } from "react";
import { terminalRuntime } from "./runtime";

export function useTheme() {
  const capability = terminalRuntime().theme;
  const snapshot = useSyncExternalStore(
    capability.subscribe,
    capability.snapshot,
    capability.snapshot,
  );
  return {
    resolvedMode: snapshot.resolvedMode,
    themeId: snapshot.themeId,
    customThemes: snapshot.themes.filter((theme) =>
      snapshot.customThemeIds.includes(theme.id),
    ),
  };
}
