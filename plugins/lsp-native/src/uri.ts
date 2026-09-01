/**
 * Path ↔ file:// URI conversion. Handles Windows drive letters and
 * percent-encoding; remote (ssh) paths are plain POSIX and round-trip too.
 */

export function pathToUri(path: string): string {
  let p = path.replace(/\\/g, "/");
  // `C:/x` → `/C:/x` so the URI gets an authority-less absolute path.
  if (/^[a-zA-Z]:\//.test(p)) p = `/${p}`;
  return `file://${p
    .split("/")
    // Keep `:` literal (Windows drive letters) — vscode-uri does the same.
    .map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ":"))
    .join("/")}`;
}

export function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  const rest = uri.slice("file://".length);
  const path = rest
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
  // `/C:/x` → `C:/x` on Windows-style paths.
  if (/^\/[a-zA-Z]:\//.test(path)) return path.slice(1);
  return path;
}
