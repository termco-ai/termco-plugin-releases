type Tokens = Record<string, string>;
const variables: Tokens = {
  background: "--terminal-background",
  foreground: "--terminal-foreground",
  cursor: "--terminal-cursor",
  cursorAccent: "--terminal-cursor-accent",
  selection: "--terminal-selection",
  ansiBlack: "--terminal-ansi-black",
  ansiRed: "--terminal-ansi-red",
  ansiGreen: "--terminal-ansi-green",
  ansiYellow: "--terminal-ansi-yellow",
  ansiBlue: "--terminal-ansi-blue",
  ansiMagenta: "--terminal-ansi-magenta",
  ansiCyan: "--terminal-ansi-cyan",
  ansiWhite: "--terminal-ansi-white",
  ansiBrightBlack: "--terminal-ansi-bright-black",
  ansiBrightRed: "--terminal-ansi-bright-red",
  ansiBrightGreen: "--terminal-ansi-bright-green",
  ansiBrightYellow: "--terminal-ansi-bright-yellow",
  ansiBrightBlue: "--terminal-ansi-bright-blue",
  ansiBrightMagenta: "--terminal-ansi-bright-magenta",
  ansiBrightCyan: "--terminal-ansi-bright-cyan",
  ansiBrightWhite: "--terminal-ansi-bright-white",
};

function readTokens(): Tokens {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    Object.entries(variables).map(([key, variable]) => [key, style.getPropertyValue(variable).trim()]),
  );
}

export function terminalPalette() {
  const value = readTokens();
  return {
    foreground: value.foreground,
    background: value.background,
    cursor: value.cursor,
    selectionBackground: value.selection,
    blue: value.ansiBlue,
    cyan: value.ansiCyan,
    green: value.ansiGreen,
    magenta: value.ansiMagenta,
    yellow: value.ansiYellow,
    brightBlack: value.ansiBrightBlack,
  };
}

export function applyTerminalCssTheme(host?: HTMLElement): void {
  const value = readTokens();
  const target = host?.style ?? document.documentElement.style;
  const names = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"];
  names.forEach((name, index) => target.setProperty(`--term-color-${index}`, value[`ansi${name}`]));
  names.forEach((name, index) => target.setProperty(`--term-color-${index + 8}`, value[`ansiBright${name}`]));
  target.setProperty("--term-fg", value.foreground);
  target.setProperty("--term-bg", value.background);
  target.setProperty("--term-cursor", value.cursor);
  target.setProperty("--term-cursor-accent", value.cursorAccent);
  target.setProperty("--term-selection", value.selection);
}
