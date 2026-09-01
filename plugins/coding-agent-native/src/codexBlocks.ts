/**
 * Translate persisted rollout records into normalized events. Field access is
 * defensive because saved schemas vary; unknown records are ignored.
 */

import type { AgentEvent } from "@termco/agents-base";

/** Flatten an OpenAI-style content value (string | array of parts) to text. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object") {
        const t = (c as { text?: unknown }).text;
        if (typeof t === "string") return t;
      }
      return "";
    })
    .join("");
}

/** Internal/system text that shouldn't render as a chat bubble. */
function isInternal(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith("<") && t.includes("system"); // <system-reminder> etc.
}

/** One rollout `response_item` payload → events (or []). */
function itemEvents(payload: Record<string, unknown>): AgentEvent[] {
  const type = typeof payload.type === "string" ? payload.type : "";
  switch (type) {
    case "message": {
      // Only real conversation turns. Rollouts also store `developer`/`system`
      // role messages (the permission-instruction walls) — never render those.
      const role = payload.role;
      if (role !== "user" && role !== "assistant") return [];
      const text = contentText(payload.content);
      if (!text.trim() || isInternal(text)) return [];
      return role === "user"
        ? [{ type: "user-message", text }]
        : [{ type: "text", text }];
    }
    case "reasoning": {
      // Reasoning is often encrypted; show it only
      // when a plaintext summary is present.
      const text =
        contentText(payload.summary) ||
        contentText(payload.content) ||
        (typeof payload.text === "string" ? payload.text : "");
      return text.trim() ? [{ type: "reasoning", text }] : [];
    }
    case "function_call":
    case "local_shell_call":
    case "custom_tool_call": {
      const id = String(payload.call_id ?? payload.id ?? "");
      if (!id) return [];
      const rawName =
        typeof payload.name === "string"
          ? payload.name
          : type === "local_shell_call"
            ? "shell"
            : "tool";
      const rawInput = payload.arguments ?? payload.input ?? {};
      let input: unknown = rawInput;
      if (typeof rawInput === "string") {
        if (rawName === "apply_patch") {
          // apply_patch's input IS the raw patch text — keep it as {patch} so
          // the diff renderer can show it.
          input = { patch: rawInput };
        } else {
          try {
            input = JSON.parse(rawInput);
          } catch {
            input = { arguments: rawInput };
          }
        }
      }
      // Normalize shell tools (`exec_command` / `local_shell_call`, arguments
      // keyed `cmd`) to our `shell` name + `command` input so it renders as the
      // bash panel like everything else.
      let name = rawName;
      if (
        rawName === "exec_command" ||
        rawName === "shell" ||
        rawName === "local_shell" ||
        type === "local_shell_call"
      ) {
        name = "shell";
        if (input && typeof input === "object") {
          const io = input as Record<string, unknown>;
          const cmd = io.command ?? io.cmd;
          if (cmd != null) {
            input = { command: Array.isArray(cmd) ? cmd.join(" ") : cmd };
          }
        }
      }
      return [{ type: "tool-start", toolCallId: id, name, input }];
    }
    case "function_call_output":
    case "custom_tool_call_output":
    case "local_shell_call_output": {
      const id = String(payload.call_id ?? payload.id ?? "");
      if (!id) return [];
      const out = payload.output ?? payload.content ?? payload.result;
      const text = typeof out === "string" ? out : contentText(out);
      return [{ type: "tool-end", toolCallId: id, output: text }];
    }
    default:
      return [];
  }
}

/** Rollout transcript lines → normalized events. Tolerant: non-JSON, unknown
 * line kinds, and `event_msg`/`turn_context`/`token_count` lines are ignored. */
export function codexRolloutToEvents(lines: string[]): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    // Rollout lines are `{type, payload}`; some builds inline the item.
    const kind = typeof o.type === "string" ? o.type : "";
    if (kind === "response_item") {
      const payload = o.payload;
      if (payload && typeof payload === "object") {
        events.push(...itemEvents(payload as Record<string, unknown>));
      }
    } else if (kind === "message" || kind === "reasoning" || kind === "function_call") {
      // Flat (un-wrapped) form.
      events.push(...itemEvents(o));
    }
    // event_msg / session_meta / turn_context / token_count → ignored.
  }
  return events;
}
// Owned by the coding-agent-native provider plugin.
