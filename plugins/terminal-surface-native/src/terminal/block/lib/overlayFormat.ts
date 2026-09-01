/**
 * Presentation helpers for the command-block overlay: human-readable duration
 * and time formatting, home-relative path shortening, and a clipboard-copy
 * helper that surfaces a toast. Pure/DOM-only — no React.
 */

import { terminalRuntime } from "../../../runtime";
import { toast } from "sonner";

function homePath(): string | null {
  try {
    return terminalRuntime().workspace.homeDir().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n;
  let u = -1;
  do {
    v /= 1024;
    u++;
  } while (v >= 1024 && u < units.length - 1);
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function fmtMtime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function fmtDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  const totalS = Math.round(ms / 1000);
  if (totalS < 60) return `${totalS}s`;
  if (totalS < 3600) {
    const m = Math.floor(totalS / 60);
    const s = totalS % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const totalM = Math.round(ms / 60000);
  const h = Math.floor(totalM / 60);
  const m = totalM % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function relPath(p: string): string {
  const home = homePath();
  if (home && (p === home || p.startsWith(`${home}/`))) {
    return `~${p.slice(home.length)}`;
  }
  return p;
}

export function copy(text: string, message: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(message))
    .catch(() => {});
}
