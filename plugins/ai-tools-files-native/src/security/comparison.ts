export function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index >= 0 ? path.slice(index + 1) : path;
}

export function comparisonForm(path: string): string {
  let value = path.replace(/\\/g, "/");
  value = value.replace(/^\/\/\?\/unc\//i, "//");
  value = value.replace(/^\/\/\?\//, "");
  value = value.replace(/^[a-zA-Z]:/, "");
  value = value.split("/").map((part) => {
    const colon = part.indexOf(":");
    return colon === -1 ? part : part.slice(0, colon);
  }).join("/");
  value = value.split("/").map((part) => part.replace(/[.\s]+$/, "")).join("/");
  value = value.replace(/\/{2,}/g, "/").toLowerCase();
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

export function isUnderProtected(value: string, directory: string): boolean {
  return `${value}/`.includes(`${directory}/`);
}
