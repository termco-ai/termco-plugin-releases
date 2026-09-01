export const TERMINAL_DEFAULTS = {
  terminalCursorBlink: false,
  terminalFontFamily: "",
  terminalFontWeight: "normal",
  terminalLetterSpacing: 0,
  terminalFontSize: 14,
  terminalShell: "",
  defaultWorkspaceEnv: "local",
  terminalScrollback: 2000,
  reconnectSshOnStartup: true,
} as const;

export interface TerminalPreferences {
  terminalCursorBlink: boolean;
  terminalFontFamily: string;
  terminalFontWeight: string;
  terminalLetterSpacing: number;
  terminalFontSize: number;
  terminalShell: string;
  defaultWorkspaceEnv: string;
  terminalScrollback: number;
  reconnectSshOnStartup: boolean;
}

export const TERMINAL_KEYS = Object.keys(TERMINAL_DEFAULTS) as Array<keyof TerminalPreferences>;
const weights = new Set(["normal", "500", "600", "bold"]);
const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const string = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function resolveTerminalPreferences(stored: Record<string, unknown>): TerminalPreferences {
  const weight = string(stored.terminalFontWeight, "normal").trim();
  return {
    terminalCursorBlink: bool(stored.terminalCursorBlink, false),
    terminalFontFamily: string(stored.terminalFontFamily).trim(),
    terminalFontWeight: weights.has(weight) ? weight : "normal",
    terminalLetterSpacing: number(stored.terminalLetterSpacing, 0, -10, 10),
    terminalFontSize: number(stored.terminalFontSize, 14, 8, 32),
    terminalShell: string(stored.terminalShell).trim(),
    defaultWorkspaceEnv: string(stored.defaultWorkspaceEnv, "local"),
    terminalScrollback: number(stored.terminalScrollback, 2000, 200, 50_000),
    reconnectSshOnStartup: bool(stored.reconnectSshOnStartup, true),
  };
}
