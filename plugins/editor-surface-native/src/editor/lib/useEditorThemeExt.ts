import { usePreferencesStore } from "../../preferences";
import { resolveEditorThemeId, useTheme } from "../../theme";
import type { Extension } from "@codemirror/state";
import { useMemo } from "react";
import { EDITOR_THEME_EXT } from "./themes";

/** Resolves the active CodeMirror theme extension, honoring the "auto" pairing. */
export function useEditorThemeExt(): Extension {
  const pref = usePreferencesStore((s) => s.editorTheme);
  const { themeId, themes, customThemes, resolvedMode } = useTheme();
  return useMemo(() => {
    const id = resolveEditorThemeId(pref);
    return EDITOR_THEME_EXT[id] ?? EDITOR_THEME_EXT.atomone;
  }, [pref, themeId, themes, customThemes, resolvedMode]);
}
