import { create } from "zustand";
import { editorRuntime } from "./runtime";

export type EditorPreferences = {
  vimMode: boolean;
  editorWordWrap: boolean;
  editorAutoSave: boolean;
  editorAutoSaveDelay: number;
  editorFormatOnSave: boolean;
  editorTheme: string;
  autocompleteEnabled: boolean;
  autocompleteModelId: string;
};

const defaults: EditorPreferences = {
  vimMode: false,
  editorWordWrap: false,
  editorAutoSave: false,
  editorAutoSaveDelay: 1000,
  editorFormatOnSave: false,
  editorTheme: "auto",
  autocompleteEnabled: true,
  autocompleteModelId: "",
};
const keys = Object.keys(defaults) as Array<keyof EditorPreferences>;
export const usePreferencesStore = create<EditorPreferences>(() => defaults);

export async function startEditorPreferences(): Promise<() => void> {
  const runtime = editorRuntime();
  const stored = await runtime.preferences.getMany(keys);
  usePreferencesStore.setState({ ...defaults, ...stored } as EditorPreferences);
  return runtime.events.subscribe("termco://prefs-changed", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { key, value } = payload as { key?: string; value?: unknown };
    if (!key || !keys.includes(key as keyof EditorPreferences)) return;
    usePreferencesStore.setState({ [key]: value } as Partial<EditorPreferences>);
  });
}
