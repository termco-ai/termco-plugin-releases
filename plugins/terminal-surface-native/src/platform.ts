const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const IS_MAC = isMac;
export const IS_WINDOWS = typeof navigator !== "undefined" && /Win/.test(navigator.platform);
export const MOD_KEY = isMac ? "⌘" : "Ctrl";
export function fmtShortcut(...parts: string[]): string {
  return parts.join(isMac ? "" : "+");
}
