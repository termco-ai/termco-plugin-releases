export const EDITOR_THEMES = [
  ["kanagawa", "Kanagawa Wave", "dark"],
  ["kanagawa-lotus", "Kanagawa Lotus", "light"],
  ["kanagawa-dragon", "Kanagawa Dragon", "dark"],
  ["tokyo-night", "Tokyo Night", "dark"],
  ["catppuccin-mocha", "Catppuccin Mocha", "dark"],
  ["catppuccin-latte", "Catppuccin Latte", "light"],
  ["rose-pine", "Rosé Pine", "dark"],
  ["rose-pine-dawn", "Rosé Pine Dawn", "light"],
  ["everforest", "Everforest Dark", "dark"],
  ["everforest-light", "Everforest Light", "light"],
  ["dracula", "Dracula", "dark"],
  ["solarized-dark", "Solarized Dark", "dark"],
  ["solarized-light", "Solarized Light", "light"],
  ["nord", "Nord", "dark"],
  ["gruvbox-dark", "Gruvbox Dark", "dark"],
  ["atomone", "Atom One", "dark"],
  ["aura", "Aura", "dark"],
  ["copilot", "Copilot", "dark"],
  ["github-dark", "GitHub Dark", "dark"],
  ["github-light", "GitHub Light", "light"],
  ["xcode-dark", "Xcode Dark", "dark"],
  ["xcode-light", "Xcode Light", "light"],
] as const;

export function editorThemesFor(mode: "light" | "dark") {
  return [...EDITOR_THEMES].sort(
    (a, b) => Number(b[2] === mode) - Number(a[2] === mode),
  );
}
