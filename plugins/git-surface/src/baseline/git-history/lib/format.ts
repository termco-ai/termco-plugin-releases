/**
 * Pure formatting helpers for the git-history pane.
 *
 * Path splitting, error normalisation, timestamp formatting, author initials
 * and colour tints, and file-status colour tones. All functions are pure and
 * side-effect free; JSX-producing helpers live in `highlight.tsx` instead.
 */

/** Last path segment of a (possibly Windows-style) path. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/** Directory portion of a path, or `""` for a top-level file. */
export function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

/** Best-effort human-readable message from an unknown thrown value. */
export function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

/** Full locale date-time for a Unix-seconds timestamp (empty for `0`). */
export function absoluteTime(secs: number): string {
  if (!secs) return "";
  return new Date(secs * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One- or two-letter uppercase initials derived from an author name. */
export function authorInitials(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const AUTHOR_TINTS = [
  "#7aa2f7", // soft blue
  "#bb9af7", // soft purple
  "#9ece6a", // soft green
  "#e0af68", // soft amber
  "#f7768e", // soft rose
  "#73daca", // soft teal
  "#ff9e64", // soft orange
  "#b4f9f8", // pale cyan
];

/** Deterministic avatar tint for an author key (name or email). */
export function authorTint(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return AUTHOR_TINTS[Math.abs(hash) % AUTHOR_TINTS.length];
}

/** Compact date: `Mon DD  HH:MM` this year, else `Mon DD YYYY`. */
export function compactDate(secs: number): string {
  if (!secs) return "";
  const d = new Date(secs * 1000);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleString(undefined, { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  if (sameYear) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day}  ${hh}:${mm}`;
  }
  return `${month} ${day} ${d.getFullYear()}`;
}

/** Tailwind text-colour class for a git file-status code (A/M/D/R/C). */
export function statusTone(code: string): string {
  switch (code.toUpperCase()) {
    case "A":
      return "text-emerald-600 dark:text-emerald-400";
    case "M":
      return "text-amber-600 dark:text-amber-300";
    case "D":
      return "text-rose-600 dark:text-rose-400";
    case "R":
    case "C":
      return "text-sky-600 dark:text-sky-300";
    default:
      return "text-muted-foreground";
  }
}
