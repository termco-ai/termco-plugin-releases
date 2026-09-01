import type { ThemeDefinition } from "@termco/ui-theme-base";

const COLOR_VARIABLES: Record<string, string> = {
  background: "--background", foreground: "--foreground", card: "--card", cardForeground: "--card-foreground",
  popover: "--popover", popoverForeground: "--popover-foreground", primary: "--primary", primaryForeground: "--primary-foreground",
  secondary: "--secondary", secondaryForeground: "--secondary-foreground", muted: "--muted", mutedForeground: "--muted-foreground",
  accent: "--accent", accentForeground: "--accent-foreground", destructive: "--destructive", border: "--border", input: "--input",
  ring: "--ring", sidebar: "--sidebar", sidebarForeground: "--sidebar-foreground", sidebarPrimary: "--sidebar-primary",
  sidebarPrimaryForeground: "--sidebar-primary-foreground", sidebarAccent: "--sidebar-accent", sidebarAccentForeground: "--sidebar-accent-foreground",
  sidebarBorder: "--sidebar-border", sidebarRing: "--sidebar-ring", radius: "--radius",
};
const TERMINAL_VARIABLES = ["--terminal-background", "--terminal-foreground", "--terminal-cursor", "--terminal-cursor-accent", "--terminal-selection"];
const ANSI_VARIABLES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "bright-black", "bright-red", "bright-green", "bright-yellow", "bright-blue", "bright-magenta", "bright-cyan", "bright-white"].map((name) => `--terminal-ansi-${name}`);
const ALL = [...Object.values(COLOR_VARIABLES), ...TERMINAL_VARIABLES, ...ANSI_VARIABLES];
let applied = false;

export function applyTheme(theme: ThemeDefinition | undefined, mode: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark"); root.classList.add(mode);
  const variant = theme?.variants[mode] ?? theme?.variants.dark ?? theme?.variants.light;
  if (!variant) { clearTheme(); return; }
  for (const variable of ALL) root.style.removeProperty(variable);
  for (const [key, value] of Object.entries(variant.colors ?? {})) {
    const variable = COLOR_VARIABLES[key]; if (variable && value) root.style.setProperty(variable, value);
  }
  const terminal = variant.terminal;
  if (terminal) {
    const values = [terminal.background, terminal.foreground, terminal.cursor, terminal.cursorAccent, terminal.selection];
    values.forEach((value, index) => { if (value) root.style.setProperty(TERMINAL_VARIABLES[index], value); });
    terminal.ansi?.forEach((value, index) => { if (ANSI_VARIABLES[index] && value) root.style.setProperty(ANSI_VARIABLES[index], value); });
  }
  applied = true;
}

export function clearTheme(): void {
  if (!applied) return;
  const root = document.documentElement;
  for (const variable of ALL) root.style.removeProperty(variable);
  applied = false;
}
