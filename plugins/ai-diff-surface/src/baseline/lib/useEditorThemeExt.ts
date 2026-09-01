import type { Extension } from "@codemirror/state";
import { useMemo, useSyncExternalStore } from "react";
import { aiDiffRuntime } from "../../runtime";
import type { EditorThemeId } from "../editorThemeTypes";
import { EDITOR_THEME_EXT } from "./themes";

/** Resolves the active CodeMirror theme extension, honoring the "auto" pairing. */
export function useEditorThemeExt(): Extension {
  const capability = aiDiffRuntime().theme;
  const snapshot = useSyncExternalStore(
    capability.subscribe,
    capability.snapshot,
    capability.snapshot,
  );
  return useMemo(() => {
    const id = capability.resolveEditorTheme(
      snapshot.editorTheme,
    ) as EditorThemeId;
    return EDITOR_THEME_EXT[id] ?? EDITOR_THEME_EXT.atomone;
  }, [capability, snapshot]);
}
