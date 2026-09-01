import { copyToClipboard, revealItem } from "../../runtime";

export { copyToClipboard };

export function revealInFinder(path: string): Promise<void> {
  return revealItem(path);
}

export const COMPACT_ITEM = "rounded-xl px-2.5 py-1.5 text-xs gap-2";
export const COMPACT_CONTENT = "min-w-44 rounded-lg p-1";

export function joinPath(parent: string, name: string): string {
  if (!parent || parent === "/") return `/${name.replace(/^\/+/, "")}`;
  return `${parent.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
}
