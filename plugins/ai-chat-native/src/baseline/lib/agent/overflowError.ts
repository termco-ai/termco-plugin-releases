import type { ErrorDetail } from "./errorMessage";

export type OverflowInfo = {
  gap?: number;
  actual?: number;
  limit?: number;
  provider: "anthropic" | "openai" | "google" | "groq" | "compat" | "unknown";
};

const NOT_OVERFLOW = /rate.?limit|too many requests|tokens per (minute|min|day|hour)|quota|RESOURCE_EXHAUSTED|insufficient_quota|billing/i;
const OVERFLOW_STATUSES = new Set([400, 413, 422]);
const PATTERNS = [
  ["anthropic", /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i, "actual-limit"],
  ["openai", /maximum context length is (\d+) tokens[\s\S]*?(?:resulted in|you requested|however you requested)\s*(\d+) tokens/i, "limit-actual"],
  ["compat", /maximum prompt length is (\d+)[^0-9]+(\d+)/i, "limit-actual"],
  ["groq", /current length is (\d+) while limit is (\d+)/i, "actual-limit"],
  ["google", /input token count \((\d+)\)[^0-9]*exceeds[^0-9]*\((\d+)\)/i, "actual-limit"],
  ["compat", /context length of only (\d+) tokens/i, "limit-only"],
] as const;
const NUMBERLESS = /context[_ ]length[_ ]exceeded|exceeds the context window|exceeds the available context size|input is too long|prompt is too long|request payload size exceeds the limit|too many tokens in the (prompt|context)/i;

function stringify(value: unknown): string {
  try { return JSON.stringify(value) ?? ""; } catch { return ""; }
}

export function classifyOverflow(error: unknown, detail?: ErrorDetail): OverflowInfo | null {
  if (error == null) return null;
  const resolved = detail ?? (typeof error === "object" ? error as ErrorDetail : {});
  const text = [
    typeof error === "string" ? error : error instanceof Error ? error.message : stringify(error),
    typeof resolved.responseBody === "string" ? resolved.responseBody : stringify(resolved.responseBody),
    stringify(resolved.data),
  ].join(" \n ");
  if (!text || NOT_OVERFLOW.test(text)) return null;
  if (typeof resolved.statusCode === "number" && !OVERFLOW_STATUSES.has(resolved.statusCode)) return null;
  for (const [provider, pattern, order] of PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (order === "limit-only") return { provider, limit: Number(match[1]) };
    const first = Number(match[1]);
    const second = Number(match[2]);
    const actual = order === "actual-limit" ? first : second;
    const limit = order === "actual-limit" ? second : first;
    return { provider, actual, limit, gap: Math.max(0, actual - limit) };
  }
  return NUMBERLESS.test(text) ? { provider: "unknown" } : null;
}
