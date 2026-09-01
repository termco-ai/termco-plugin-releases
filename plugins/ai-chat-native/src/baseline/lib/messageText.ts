/**
 * Extract a message's visible text (text parts only) for copy-to-clipboard and
 * edit affordances. Shared by the normal chat and the coding-agents transcript.
 */

import type { UIMessage } from "ai";

export function messagePlainText(m: UIMessage): string {
  const parts = (m.parts ?? []) as Array<{ type?: string; text?: unknown }>;
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n\n")
    .trim();
}

/** Short local time (e.g. "14:32") from a ms timestamp, or "" when absent. */
export function shortTime(ts: number | undefined): string {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** A message's createdAt metadata timestamp (ms), when present. */
export function messageCreatedAt(m: UIMessage): number | undefined {
  const meta = (m as { metadata?: { createdAt?: unknown } }).metadata;
  return typeof meta?.createdAt === "number" ? meta.createdAt : undefined;
}
