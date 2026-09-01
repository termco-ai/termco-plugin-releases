export const THEME_FILE_EXTENSION = ".termco-theme";

export function joinPath(separator: string, ...parts: string[]): string {
  const escaped = separator === "\\" ? /[\\/]+/g : /\/+/g;
  const normalized = parts
    .filter(Boolean)
    .map((part, index) => {
      if (separator === "\\") {
        return index === 0
          ? part.replace(/[\\/]+$/g, "")
          : part.replace(/^[\\/]+|[\\/]+$/g, "");
      }
      return index === 0
        ? part.replace(/\/+$/g, "")
        : part.replace(/^\/+|\/+$/g, "");
    });
  return normalized.join(separator).replace(escaped, separator);
}

export function isThemeFilePath(path: string): boolean {
  return path.toLowerCase().endsWith(THEME_FILE_EXTENSION);
}

export function themeFilePath(appConfigDir: string, separator: string, id: string): string {
  return joinPath(separator, appConfigDir, "themes", `${id}${THEME_FILE_EXTENSION}`);
}
