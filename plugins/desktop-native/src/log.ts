import type { DesktopLogLevel } from "@termco/desktop-base";

export function normalizeLogLevel(level: unknown): DesktopLogLevel {
  return level === "error" || level === "warn" ? level : "info";
}
