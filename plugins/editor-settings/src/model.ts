export const EDITOR_DEFAULTS = {
  vimMode: false,
  editorWordWrap: false,
  editorFormatOnSave: true,
  editorAutoSave: false,
  editorAutoSaveDelay: 1000,
} as const;

export type EditorPreferences = {
  -readonly [K in keyof typeof EDITOR_DEFAULTS]: (typeof EDITOR_DEFAULTS)[K] extends boolean
    ? boolean
    : number;
};

export const EDITOR_KEYS = Object.keys(EDITOR_DEFAULTS) as Array<keyof EditorPreferences>;

export function resolveEditorPreferences(
  stored: Record<string, unknown>,
): EditorPreferences {
  return {
    vimMode: typeof stored.vimMode === "boolean" ? stored.vimMode : EDITOR_DEFAULTS.vimMode,
    editorWordWrap: typeof stored.editorWordWrap === "boolean" ? stored.editorWordWrap : EDITOR_DEFAULTS.editorWordWrap,
    editorFormatOnSave: typeof stored.editorFormatOnSave === "boolean" ? stored.editorFormatOnSave : EDITOR_DEFAULTS.editorFormatOnSave,
    editorAutoSave: typeof stored.editorAutoSave === "boolean" ? stored.editorAutoSave : EDITOR_DEFAULTS.editorAutoSave,
    editorAutoSaveDelay: clampAutoSaveDelay(stored.editorAutoSaveDelay),
  };
}

export function clampAutoSaveDelay(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(60_000, Math.max(100, Math.round(value)))
    : EDITOR_DEFAULTS.editorAutoSaveDelay;
}
