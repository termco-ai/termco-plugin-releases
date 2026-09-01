import type {} from "@termco/kernel";
import type { ComponentType, ReactNode } from "react";

export const UI_THEME_SERVICE = "ui.theme";

export type ThemeModePreference = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

export type ThemeColors = Partial<
  Record<
    | "background"
    | "foreground"
    | "card"
    | "cardForeground"
    | "popover"
    | "popoverForeground"
    | "primary"
    | "primaryForeground"
    | "secondary"
    | "secondaryForeground"
    | "muted"
    | "mutedForeground"
    | "accent"
    | "accentForeground"
    | "destructive"
    | "border"
    | "input"
    | "ring"
    | "sidebar"
    | "sidebarForeground"
    | "sidebarPrimary"
    | "sidebarPrimaryForeground"
    | "sidebarAccent"
    | "sidebarAccentForeground"
    | "sidebarBorder"
    | "sidebarRing"
    | "radius",
    string
  >
>;

export interface ThemeDefinition {
  id: string;
  name: string;
  author?: string;
  description?: string;
  variants: Partial<
    Record<
      ResolvedThemeMode,
      {
        colors?: ThemeColors;
        terminal?: {
          background?: string;
          foreground?: string;
          cursor?: string;
          cursorAccent?: string;
          selection?: string;
          ansi?: readonly string[];
        };
      }
    >
  >;
  editorTheme?: Partial<Record<ResolvedThemeMode, string>>;
}

export interface ThemeSnapshot {
  revision: number;
  mode: ThemeModePreference;
  resolvedMode: ResolvedThemeMode;
  themeId: string;
  themes: readonly ThemeDefinition[];
  customThemeIds: readonly string[];
  editorTheme: string;
  background: {
    kind: "none" | "image";
    imageId: string | null;
    opacity: number;
    blur: number;
  };
}

// biome-ignore format: Preserve the frozen public contract token signature.
export type ThemeMutation =
  | { type: "set-mode"; mode: ThemeModePreference }
  | { type: "set-theme"; id: string }
  | { type: "preview-theme"; id: string | null }
  | { type: "set-editor-theme"; id: string }
  | { type: "save-custom-theme"; theme: ThemeDefinition }
  | { type: "delete-custom-theme"; id: string }
  | { type: "import-background"; file: File }
  | { type: "remove-background" }
  | { type: "set-background-opacity"; value: number }
  | { type: "set-background-blur"; value: number }
  | { type: "request-edit"; request: { action: "create" } | { action: "edit"; id: string } };

export type ThemeValidationResult =
  | { ok: true; theme: ThemeDefinition }
  | { ok: false; error: string };

/** Selected renderer-wide appearance implementation. The Root owns DOM theme
 * application and the desktop background; all callers share its snapshot. */
export interface UiThemeCapability {
  Root: ComponentType<{ children?: ReactNode }>;
  snapshot(): ThemeSnapshot;
  subscribe(listener: () => void): () => void;
  // biome-ignore format: Preserve the frozen public contract token signature.
  mutate(mutation: ThemeMutation): Promise<{ imageId?: string; themeId?: string }>;
  validate(raw: unknown): ThemeValidationResult;
  resolveEditorTheme(preference: string): string;
}

declare module "@termco/kernel" {
  interface Services {
    [UI_THEME_SERVICE]: UiThemeCapability;
  }
}
