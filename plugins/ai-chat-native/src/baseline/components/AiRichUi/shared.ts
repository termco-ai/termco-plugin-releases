/**
 * Shared bits of the rich chat views: the click-to-open bridge and the
 * severity palette. Kept free of JSX so the views stay thin.
 */

// Type-free at runtime except for the dispatcher itself — the event bus is the
// same one terminal block widgets use, so no props have to be threaded from App.
import { openFileFromBlock } from "../../runtime/navigation";
import { useChatStore } from "../../store/chatStore";
import type { FileRefSpec, SeverityLevel } from "./types";

/**
 * Open a place the model pointed at. Lands on the line when it gave one.
 *
 * Models routinely answer with workspace-relative paths (`app/api/v2/x.json`),
 * and handing one straight to the tab opener makes it stat that literal string —
 * ENOENT, and on an SSH rig against the remote home rather than the project.
 * So resolve against the same workspace root the agent itself works from.
 */
export function openRef(ref: FileRefSpec): void {
  openFileFromBlock(absolutePath(ref.file), ref.line, ref.column);
}

const isAbsolute = (p: string) =>
  p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p);

export function absolutePath(
  file: string,
  root = useChatStore.getState().live.getWorkspaceRoot(),
): string {
  const path = file.trim();
  if (!path || isAbsolute(path)) return path;
  if (!root) return path;
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const base = root.endsWith(sep) ? root.slice(0, -sep.length) : root;
  // "./x" and "x" both mean "under the root".
  return `${base}${sep}${path.replace(/^\.\/+/, "")}`;
}

/** `path:line` the way the rest of the app writes it. */
export function formatRef(ref: FileRefSpec): string {
  return ref.line ? `${ref.file}:${ref.line}` : ref.file;
}

/** `file.ts:24` — what fits in a narrow dock. Pair it with `formatRef` in a
 * `title` so the full path is still one hover away. */
export function shortRef(ref: FileRefSpec): string {
  const i = Math.max(ref.file.lastIndexOf("/"), ref.file.lastIndexOf("\\"));
  const name = i >= 0 ? ref.file.slice(i + 1) : ref.file;
  return ref.line ? `${name}:${ref.line}` : name;
}

export const SEVERITY_DOT: Record<SeverityLevel, string> = {
  error: "bg-destructive",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  success: "bg-emerald-500",
};

export const SEVERITY_TEXT: Record<SeverityLevel, string> = {
  error: "text-destructive",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-sky-700 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

export const SEVERITY_BADGE: Record<SeverityLevel, string> = {
  error: "bg-destructive/15 text-destructive",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const SEVERITY_ORDER: Record<SeverityLevel, number> = {
  error: 0,
  warning: 1,
  info: 2,
  success: 3,
};

/** Worst first — a review list is useless if the errors are at the bottom. */
export function bySeverity<T extends { severity: SeverityLevel }>(
  a: T,
  b: T,
): number {
  return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
}

export function cellText(v: string | number | boolean | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}
