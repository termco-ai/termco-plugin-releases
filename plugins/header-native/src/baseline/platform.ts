export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";
export const KEY_SEP = IS_MAC ? "" : "+";

export function fmtShortcut(...keys: string[]): string {
  return keys.join(KEY_SEP);
}
