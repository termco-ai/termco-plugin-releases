import type { ThemeDefinition, ThemeValidationResult } from "@termco/ui-theme-base";
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from "./catalog";

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const COLOR_KEYS = new Set([
  "background", "foreground", "card", "cardForeground", "popover", "popoverForeground",
  "primary", "primaryForeground", "secondary", "secondaryForeground", "muted", "mutedForeground",
  "accent", "accentForeground", "destructive", "border", "input", "ring", "sidebar",
  "sidebarForeground", "sidebarPrimary", "sidebarPrimaryForeground", "sidebarAccent",
  "sidebarAccentForeground", "sidebarBorder", "sidebarRing", "radius",
]);
const EDITOR_THEMES = new Set([
  "kanagawa", "kanagawa-lotus", "kanagawa-dragon", "tokyo-night", "catppuccin-mocha",
  "catppuccin-latte", "rose-pine", "rose-pine-dawn", "everforest", "everforest-light",
  "dracula", "solarized-dark", "solarized-light", "nord", "gruvbox-dark", "atomone",
  "aura", "copilot", "github-dark", "github-light", "xcode-dark", "xcode-light",
]);

export function normalizeEditorThemePreference(value: unknown): string {
  return value === "auto" ||
    (typeof value === "string" && EDITOR_THEMES.has(value))
    ? value
    : "auto";
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function validateTheme(raw: unknown): ThemeValidationResult {
  if (!object(raw)) return { ok: false, error: "Theme must be a JSON object" };
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return { ok: false, error: "id must be a kebab-case string (a-z, 0-9, -)" };
  if (typeof raw.name !== "string" || !raw.name.trim()) return { ok: false, error: "name must be a non-empty string" };
  if (!object(raw.variants)) return { ok: false, error: "variants must be an object" };
  const variants: ThemeDefinition["variants"] = {};
  for (const mode of ["light", "dark"] as const) {
    const candidate = raw.variants[mode];
    if (candidate === undefined) continue;
    if (!object(candidate)) return { ok: false, error: `variants.${mode} must be an object` };
    const variant: NonNullable<ThemeDefinition["variants"][typeof mode]> = {};
    if (candidate.colors !== undefined) {
      if (!object(candidate.colors)) return { ok: false, error: `variants.${mode}.colors must be an object` };
      for (const [key, value] of Object.entries(candidate.colors)) {
        if (!COLOR_KEYS.has(key)) return { ok: false, error: `variants.${mode}.colors.${key} is not a recognized color key` };
        if (typeof value !== "string" || !value) return { ok: false, error: `variants.${mode}.colors.${key} must be a non-empty string` };
      }
      variant.colors = candidate.colors as NonNullable<typeof variant.colors>;
    }
    if (candidate.terminal !== undefined) {
      if (!object(candidate.terminal)) return { ok: false, error: `variants.${mode}.terminal must be an object` };
      for (const key of ["background", "foreground", "cursor", "cursorAccent", "selection"] as const) {
        if (candidate.terminal[key] !== undefined && typeof candidate.terminal[key] !== "string") {
          return { ok: false, error: `variants.${mode}.terminal.${key} must be a string` };
        }
      }
      if (candidate.terminal.ansi !== undefined) {
        if (!Array.isArray(candidate.terminal.ansi) || candidate.terminal.ansi.length !== 16) {
          return { ok: false, error: `variants.${mode}.terminal.ansi must be an array of 16 strings` };
        }
        const invalidIndex = candidate.terminal.ansi.findIndex((entry) => typeof entry !== "string");
        if (invalidIndex !== -1) {
          return { ok: false, error: `variants.${mode}.terminal.ansi[${invalidIndex}] must be a string` };
        }
      }
      variant.terminal = candidate.terminal as NonNullable<typeof variant.terminal>;
    }
    variants[mode] = variant;
  }
  if (!variants.light && !variants.dark) return { ok: false, error: "variants must contain at least one of: light, dark" };
  const theme: ThemeDefinition = { id: raw.id, name: raw.name.trim(), variants };
  if (typeof raw.author === "string") theme.author = raw.author;
  if (typeof raw.description === "string") theme.description = raw.description;
  if (object(raw.editorTheme)) {
    const editorTheme: NonNullable<ThemeDefinition["editorTheme"]> = {};
    if (typeof raw.editorTheme.light === "string") editorTheme.light = raw.editorTheme.light;
    if (typeof raw.editorTheme.dark === "string") editorTheme.dark = raw.editorTheme.dark;
    if (editorTheme.light || editorTheme.dark) theme.editorTheme = editorTheme;
  }
  return { ok: true, theme };
}

export function normalizeCustomThemes(value: unknown): ThemeDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => { const result = validateTheme(candidate); return result.ok ? [result.theme] : []; });
}

export function resolveEditorTheme(preference: string, themeId: string, themes: readonly ThemeDefinition[], mode: "light" | "dark"): string {
  if (preference !== "auto" && EDITOR_THEMES.has(preference)) return preference;
  const theme = themes.find((entry) => entry.id === themeId) ?? BUILTIN_THEMES.find((entry) => entry.id === DEFAULT_THEME_ID);
  const mapped = theme?.editorTheme?.[mode] ?? theme?.editorTheme?.dark ?? theme?.editorTheme?.light;
  return mapped && EDITOR_THEMES.has(mapped) ? mapped : mode === "light" ? "github-light" : "atomone";
}

export function createStarterTheme(): ThemeDefinition {
  const id = `my-theme-${crypto.randomUUID().slice(0, 8)}`;
  return {
    id,
    name: "My Theme",
    description: "Custom theme.",
    variants: {
      dark: {
        colors: {
          background: "#0d0d10", foreground: "#e8e8ea", card: "#15151a", cardForeground: "#e8e8ea",
          popover: "#15151a", popoverForeground: "#e8e8ea", primary: "#7dd3fc", primaryForeground: "#0d0d10",
          muted: "#1c1c22", mutedForeground: "#a0a0a8", accent: "#1c1c22", accentForeground: "#e8e8ea",
          border: "rgba(255,255,255,0.08)", input: "rgba(255,255,255,0.12)", ring: "#7dd3fc",
          sidebar: "#0a0a0d", sidebarForeground: "#e8e8ea", sidebarPrimary: "#7dd3fc",
          sidebarAccent: "#1c1c22", sidebarBorder: "rgba(255,255,255,0.08)", sidebarRing: "#7dd3fc",
        },
        terminal: {
          background: "#0d0d10", foreground: "#e8e8ea", cursor: "#e8e8ea",
          cursorAccent: "#0d0d10", selection: "rgba(125,211,252,0.22)",
        },
      },
    },
  };
}
