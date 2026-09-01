/** Resolve a tool-supplied path against the active terminal directory. */
export function resolvePath(rawPath: string, cwd: string | null): string {
  if (rawPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rawPath)) {
    return rawPath;
  }
  if (!cwd) {
    throw new Error(
      `cannot resolve relative path "${rawPath}": no active terminal cwd. Pass an absolute path.`,
    );
  }
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(separator)
    ? `${cwd}${rawPath}`
    : `${cwd}${separator}${rawPath}`;
}
