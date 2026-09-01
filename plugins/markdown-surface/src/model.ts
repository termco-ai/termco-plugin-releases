export type MarkdownLoadState =
  | { kind: "ready"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge"; size: number; limit: number }
  | { kind: "error"; message: string };

export function markdownLoadState(value: unknown): MarkdownLoadState {
  if (!value || typeof value !== "object") return { kind: "error", message: "Invalid file response" };
  const file = value as { kind?: unknown; content?: unknown; size?: unknown; limit?: unknown };
  if (file.kind === "text" && typeof file.content === "string") return { kind: "ready", content: file.content };
  if (file.kind === "binary") return { kind: "binary" };
  if (file.kind === "toolarge") {
    return {
      kind: "toolarge",
      size: typeof file.size === "number" ? file.size : 0,
      limit: typeof file.limit === "number" ? file.limit : 0,
    };
  }
  return { kind: "error", message: "Unsupported file response" };
}
