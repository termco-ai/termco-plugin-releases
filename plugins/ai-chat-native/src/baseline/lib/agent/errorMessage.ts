export type ErrorDetail = {
  statusCode?: unknown;
  responseBody?: unknown;
  data?: unknown;
};

function reasonFrom(body: unknown): string | null {
  if (!body) return null;
  let value = body;
  if (typeof body === "string") {
    const text = body.trim();
    if (!text) return null;
    try {
      value = JSON.parse(text);
    } catch {
      return text.slice(0, 300);
    }
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { error?: unknown; message?: unknown };
  if (record.error && typeof record.error === "object") {
    const message = (record.error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  return typeof record.message === "string" && record.message.trim()
    ? record.message.trim()
    : null;
}

export function buildErrorMessage(error: unknown, detail: ErrorDetail): string {
  const base = error instanceof Error ? error.message : String(error ?? "");
  const reason = reasonFrom(detail.responseBody) ?? reasonFrom(detail.data);
  const status = typeof detail.statusCode === "number"
    ? `HTTP ${detail.statusCode}`
    : null;
  const generic = !base || /an error occurred/i.test(base);
  if (reason) {
    const prefix = status ? `${status}: ` : "";
    return generic ? `${prefix}${reason}` : `${base} — ${prefix}${reason}`;
  }
  if (generic && status) return `${status} — ${base || "request failed"}`;
  return base || "An error occurred.";
}
