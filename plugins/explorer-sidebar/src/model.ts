import type { WorkspaceDirEntry } from "@termco/files-base";

export function separator(path: string): "/" | "\\" {
  return path.includes("\\") && !path.includes("/") ? "\\" : "/";
}

export function joinPath(parent: string, name: string): string {
  const sep = separator(parent);
  return `${parent.replace(/[\\/]$/, "")}${sep}${name.replace(/^[\\/]/, "")}`;
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index <= 0) return index === 0 ? trimmed[0] : trimmed;
  return trimmed.slice(0, index);
}

export function isUnder(path: string, root: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/$/, "");
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

export function sortEntries(entries: readonly WorkspaceDirEntry[]): WorkspaceDirEntry[] {
  const rank = (entry: WorkspaceDirEntry) => entry.kind === "dir" ? 0 : entry.kind === "symlink" ? 1 : 2;
  return [...entries].sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}
