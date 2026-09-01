/** Shared translation from streaming and persisted content blocks to events. */

import type { AgentEvent } from "@termco/agents-base";

export type ClaudeBlock = { type: string; [k: string]: unknown };

/** Internal system text that should never render as a chat bubble. */
const INTERNAL_PREFIXES = [
  "<system-reminder>",
  "<local-command-caveat>",
  "Caveat:",
  "[Request interrupted",
];
function isInternal(text: string): boolean {
  const t = text.trimStart();
  return INTERNAL_PREFIXES.some((p) => t.startsWith(p));
}

/** The content-block array of a stream-json event or a transcript line. */
export function contentArray(obj: Record<string, unknown>): ClaudeBlock[] {
  const message = obj.message as Record<string, unknown> | undefined;
  const content = message?.content ?? obj.content;
  return Array.isArray(content) ? (content as ClaudeBlock[]) : [];
}

/** Flatten a tool_result's `content` (string | block[]) to text. */
export function stringifyToolContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === "string"
          ? c
          : typeof (c as { text?: unknown }).text === "string"
            ? (c as { text: string }).text
            : "",
      )
      .join("");
  }
  return content == null ? "" : JSON.stringify(content);
}

/** An assistant message's blocks → one message (start … end), preserving order. */
export function assistantEvents(blocks: ClaudeBlock[]): AgentEvent[] {
  if (blocks.length === 0) return [];
  const out: AgentEvent[] = [{ type: "message-start" }];
  for (const b of blocks) {
    if (b.type === "tool_use") {
      out.push({
        type: "tool-start",
        toolCallId: String(b.id ?? ""),
        name: String(b.name ?? "tool"),
        input: b.input ?? {},
      });
    } else if (b.type === "text" && typeof b.text === "string" && b.text) {
      out.push({ type: "text", text: b.text });
    } else if (b.type === "thinking" && typeof b.thinking === "string" && b.thinking) {
      out.push({ type: "reasoning", text: b.thinking });
    }
  }
  out.push({ type: "message-end" });
  return out;
}

/**
 * A user message's content → `tool-end`s for its tool_result blocks, and/or a
 * `user-message` for real human text. In live stream-json a user message is only
 * tool_results; in a saved transcript it's also the human's prompts.
 */
export function userEvents(content: unknown): AgentEvent[] {
  if (typeof content === "string") {
    return content.trim() && !isInternal(content)
      ? [{ type: "user-message", text: content }]
      : [];
  }
  if (!Array.isArray(content)) return [];
  const out: AgentEvent[] = [];
  for (const b of content as ClaudeBlock[]) {
    if (b.type === "tool_result") {
      const toolCallId = String(b.tool_use_id ?? "");
      if (!toolCallId) continue;
      const text = stringifyToolContent(b.content);
      if (b.is_error) out.push({ type: "tool-end", toolCallId, error: text });
      else out.push({ type: "tool-end", toolCallId, output: text });
    } else if (b.type === "text" && typeof b.text === "string" && b.text && !isInternal(b.text)) {
      out.push({ type: "user-message", text: b.text });
    }
  }
  return out;
}
// Owned by the coding-agent-native provider plugin.
