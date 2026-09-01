import { useSyncExternalStore } from "react";
import { editorRuntime } from "./runtime";
import type { EditorThemeId } from "./editorThemeTypes";

export function useTheme() {
  const capability = editorRuntime().theme;
  const snapshot = useSyncExternalStore(
    capability.subscribe,
    capability.snapshot,
    capability.snapshot,
  );
  return {
    themeId: snapshot.themeId,
    themes: snapshot.themes,
    customThemes: snapshot.themes.filter((theme) => snapshot.customThemeIds.includes(theme.id)),
    resolvedMode: snapshot.resolvedMode,
  };
}

export function resolveEditorThemeId(preference: string): EditorThemeId {
  return editorRuntime().theme.resolveEditorTheme(preference) as EditorThemeId;
}
