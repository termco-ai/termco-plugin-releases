/** Preserve POSIX case; only Windows paths compare case-insensitively. */
export function scopePath(path: string): string {
  const windows = /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\");
  const value = windows ? path.replace(/\\/g, "/") : path;
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const normalized = `${value.startsWith("/") ? "/" : ""}${parts.join("/")}`;
  return windows ? normalized.toLowerCase() : normalized;
}

export function isWithinDirectory(path: string, root: string): boolean {
  const candidate = scopePath(path);
  const directory = scopePath(root);
  return candidate === directory || candidate.startsWith(directory === "/" ? "/" : `${directory}/`);
}
