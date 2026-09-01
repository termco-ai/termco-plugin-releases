/**
 * Non-interactive CLI adapter. It normalizes flat thread, turn, item, and usage
 * events while safely ignoring unknown schema additions.
 */

import type {
  AgentEvent,
  AgentRunStartParams,
  AgentUsage,
} from "@termco/agents-base";
import type { BackendAdapter, BuiltCommand } from "./types";

export function createCodexAdapter(): BackendAdapter {
  const st: CodexState = {
    // Current command items that have emitted item.started but not item.completed.
    openCalls: new Set<string>(),
  };
  return {
    buildCommand,
    parseLine: (line) => parseLine(line, st),
  };
}

type CodexState = {
  openCalls: Set<string>;
};

function buildCommand(p: AgentRunStartParams): BuiltCommand {
  // `resume` is a SUBCOMMAND of `exec` and must come first:
  //   exec resume <session-id> [flags] [prompt]
  //   exec [flags] [prompt]
  const args = p.resumeSessionId
    ? [
        "exec",
        "resume",
        p.resumeSessionId,
        "--json",
        "--skip-git-repo-check",
      ]
    : ["exec", "--json", "--skip-git-repo-check"];
  if (p.model) args.push("--model", p.model);
  // This backend takes reasoning effort as a `-c` config override.
  if (p.effort) args.push("-c", `model_reasoning_effort=${p.effort}`);
  // Backend sandbox posture maps our permission modes. (`--full-auto` no longer
  // exists in 0.147.0 — it made every acceptEdits spawn exit 2.)
  if (p.permissionMode === "bypass") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (p.permissionMode === "acceptEdits") {
    args.push("--sandbox", "workspace-write");
  } else if (p.permissionMode === "plan") {
    args.push("--sandbox", "read-only");
  }
  // Default: no flag, preserving the user's configured posture.
  // The Termco MCP control server reads its bearer from an environment variable
  // (`bearer_token_env_var`), so the token never enters argv.
  if (p.mcpUrl) {
    args.push("-c", `mcp_servers.termco.url="${p.mcpUrl}"`);
    args.push("-c", `mcp_servers.termco.bearer_token_env_var="TERMCO_MCP_TOKEN"`);
  }
  // The prompt is the trailing positional argument.
  args.push(p.prompt);
  const env = p.mcpToken ? { TERMCO_MCP_TOKEN: p.mcpToken } : undefined;
  return { bin: "codex", args, env };
}

function parseLine(line: string, st: CodexState): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const msg = obj;
  const type = msg.type as string | undefined;
  if (!type) return [];

  switch (type) {
    // Current schema, verified against CLI version 0.147.0.
    case "thread.started":
      return [
        {
          type: "session",
          sessionId: String(msg.thread_id ?? ""),
        },
      ];

    case "turn.started":
      return [];

    case "item.started":
    case "item.updated":
    case "item.completed": {
      const item = msg.item as Record<string, unknown> | undefined;
      if (!item) return [];
      return itemEvents(type, item, st);
    }

    case "turn.completed":
      return [{ type: "turn-end", usage: usageOf(msg.usage) }];

    case "turn.failed": {
      const err = msg.error as Record<string, unknown> | undefined;
      return [
        {
          type: "error",
          message: String(err?.message ?? msg.message ?? "codex turn failed"),
          fatal: true,
        },
      ];
    }

    default:
      return [];
  }
}

/** Map one thread item (current schema) to events. */
function itemEvents(
  eventType: "item.started" | "item.updated" | "item.completed",
  item: Record<string, unknown>,
  st: CodexState,
): AgentEvent[] {
  const completed = eventType === "item.completed";
  const id = String(item.id ?? "");
  switch (item.type as string | undefined) {
    case "agent_message":
      // Complete items only — exec --json streams no deltas.
      return completed ? textBlock(item.text) : [];

    case "reasoning":
      return completed ? reasoningBlock(item.text) : [];

    case "command_execution": {
      if (!id) return [];
      if (!completed) {
        if (st.openCalls.has(id)) return []; // item.updated: already started
        st.openCalls.add(id);
        return [
          {
            type: "tool-start",
            toolCallId: id,
            name: "shell",
            input: { command: joinCommand(item.command) },
          },
        ];
      }
      // A completed item without a preceding start still renders as one call.
      const events: AgentEvent[] = [];
      if (!st.openCalls.has(id)) {
        events.push({
          type: "tool-start",
          toolCallId: id,
          name: "shell",
          input: { command: joinCommand(item.command) },
        });
      }
      st.openCalls.delete(id);
      const exit = typeof item.exit_code === "number" ? item.exit_code : 0;
      const output = String(item.aggregated_output ?? "");
      events.push(
        exit === 0
          ? { type: "tool-end", toolCallId: id, output }
          : { type: "tool-end", toolCallId: id, error: output || `exit ${exit}` },
      );
      return events;
    }

    case "file_change": {
      // Render applied patches through the shared diff presentation.
      if (!id || !completed) return [];
      return [
        {
          type: "tool-start",
          toolCallId: id,
          name: "apply_patch",
          input: { changes: item.changes ?? item.patch ?? item },
        },
        { type: "tool-end", toolCallId: id, output: "" },
      ];
    }

    case "error":
      return completed
        ? [
            {
              type: "error",
              message: String(item.message ?? "codex error"),
              fatal: false,
            },
          ]
        : [];

    default:
      return [];
  }
}

/** Current-schema usage: snake_case with `cached_input_tokens`. */
function usageOf(u: unknown): AgentUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const usage = u as Record<string, unknown>;
  return {
    inputTokens: numeric(usage.input_tokens),
    outputTokens: numeric(usage.output_tokens),
    cachedInputTokens: numeric(usage.cached_input_tokens),
  };
}

function numeric(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function textBlock(v: unknown): AgentEvent[] {
  return typeof v === "string" && v.length > 0 ? [{ type: "text", text: v }] : [];
}
function reasoningBlock(v: unknown): AgentEvent[] {
  return typeof v === "string" && v.length > 0 ? [{ type: "reasoning", text: v }] : [];
}

function joinCommand(command: unknown): string {
  if (typeof command === "string") return command;
  if (Array.isArray(command)) return command.map(String).join(" ");
  return "";
}
// Owned by the coding-agent-native provider plugin.
