import { create } from "zustand";
import { terminalRuntime } from "./runtime";

export type TerminalPreferences = {
  terminalCursorBlink: boolean;
  terminalFontFamily: string;
  terminalFontWeight: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  terminalShell: string;
  terminalScrollback: number;
  zoomLevel: number;
  backgroundKind: "none" | "image";
  backgroundImageId: string | null;
};

const defaults: TerminalPreferences = {
  terminalCursorBlink: false,
  terminalFontFamily: "",
  terminalFontWeight: "normal",
  terminalLetterSpacing: 0,
  terminalFontSize: 14,
  terminalShell: "",
  terminalScrollback: 2000,
  zoomLevel: 1,
  backgroundKind: "none",
  backgroundImageId: null,
};

const keys = Object.keys(defaults) as Array<keyof TerminalPreferences>;

export const usePreferencesStore = create<TerminalPreferences>(() => defaults);

export async function startTerminalPreferences(): Promise<() => void> {
  const runtime = terminalRuntime();
  const stored = await runtime.preferences.getMany(keys);
  usePreferencesStore.setState({ ...defaults, ...stored } as TerminalPreferences);
  return runtime.events.subscribe("termco://prefs-changed", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { key, value } = payload as { key?: string; value?: unknown };
    if (!key || !keys.includes(key as keyof TerminalPreferences)) return;
    usePreferencesStore.setState({ [key]: value } as Partial<TerminalPreferences>);
  });
}
