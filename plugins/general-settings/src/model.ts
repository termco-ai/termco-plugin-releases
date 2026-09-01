export const GENERAL_DEFAULTS = {
  autostart: false,
  restoreWindowState: true,
  showHidden: false,
  explorerGitDecorations: true,
  agentNotifications: true,
  agentAutoApprove: false,
  richChatUi: true,
  zoomLevel: 1,
} as const;

export type GeneralPreferences = {
  -readonly [K in keyof typeof GENERAL_DEFAULTS]: (typeof GENERAL_DEFAULTS)[K] extends boolean
    ? boolean
    : number;
};

export const GENERAL_KEYS = Object.keys(GENERAL_DEFAULTS) as Array<keyof GeneralPreferences>;

export function clampZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return GENERAL_DEFAULTS.zoomLevel;
  return Math.min(2, Math.max(0.5, Math.round(value * 20) / 20));
}

export function resolveGeneralPreferences(stored: Record<string, unknown>): GeneralPreferences {
  const boolean = <K extends keyof GeneralPreferences>(key: K): boolean =>
    typeof stored[key] === "boolean"
      ? stored[key] as boolean
      : GENERAL_DEFAULTS[key] as boolean;
  return {
    autostart: boolean("autostart"),
    restoreWindowState: boolean("restoreWindowState"),
    showHidden: boolean("showHidden"),
    explorerGitDecorations: boolean("explorerGitDecorations"),
    agentNotifications: boolean("agentNotifications"),
    agentAutoApprove: boolean("agentAutoApprove"),
    richChatUi: boolean("richChatUi"),
    zoomLevel: clampZoom(stored.zoomLevel),
  };
}
