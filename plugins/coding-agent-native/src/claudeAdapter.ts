/**
 * Streaming-CLI adapter. It normalizes complete NDJSON messages into
 * `AgentEvent`s and deliberately ignores partial-message duplicates.
 */

import type {
  AgentEvent,
  AgentRunStartParams,
  AgentUsage,
} from "@termco/agents-base";
import { assistantEvents, contentArray, userEvents } from "./claudeBlocks";
import type { BackendAdapter, BuiltCommand, PermissionModeMap } from "./types";

const PERMISSION_MODE: PermissionModeMap = {
  default: "default",
  acceptEdits: "acceptEdits",
  plan: "plan",
  bypass: "bypassPermissions",
};

export function createClaudeAdapter(): BackendAdapter {
  return { buildCommand, parseLine };
}

/** Map effort levels onto the backend's thinking-token environment setting. */
const THINKING_TOKENS: Record<string, number> = {
  low: 4096,
  medium: 12000,
  high: 31999,
};

function buildCommand(p: AgentRunStartParams): BuiltCommand {
  const args = ["-p", p.prompt, "--output-format", "stream-json", "--verbose"];
  if (p.model) args.push("--model", p.model);
  if (p.permissionMode) {
    args.push("--permission-mode", PERMISSION_MODE[p.permissionMode]);
  }
  if (p.resumeSessionId) args.push("--resume", p.resumeSessionId);
  // The termco MCP control server (app-control tools). The token is an ENV
  // REFERENCE inside the config — argv stays secret-free.
  if (p.mcpUrl) {
    args.push("--mcp-config", mcpConfigJson(p.mcpUrl));
  }
  // The backend honors only the last --settings flag, so permissions and the
  // approval hook share one object. Termco MCP tools are excluded from the hook
  // because the MCP server is already their approval authority.
  const settings = buildSettings(p);
  if (settings) args.push("--settings", settings);
  const budget = p.effort ? THINKING_TOKENS[p.effort] : undefined;
  const env: Record<string, string> = {};
  if (budget) env.MAX_THINKING_TOKENS = String(budget);
  // Full-auto requires the backend's supported root-guard override on SSH hosts.
  // The selected rig remains the sandbox boundary. SSH embeds this environment
  // setting in the remote command because local variables do not cross SSH.
  if (p.permissionMode === "bypass") env.IS_SANDBOX = "1";
  // Token via env (local); for ssh the driver strips this and feeds it on stdin.
  if (p.mcpToken) env.TERMCO_MCP_TOKEN = p.mcpToken;
  return {
    bin: "claude",
    args,
    env: Object.keys(env).length ? env : undefined,
  };
}

/** The `--mcp-config` blob wiring the termco streamable-HTTP server. The bearer
 * header is an env reference (`${TERMCO_MCP_TOKEN}`) so the token never enters
 * argv (visible in `ps` on multi-user hosts). */
export function mcpConfigJson(url: string): string {
  return JSON.stringify({
    mcpServers: {
      termco: {
        type: "http",
        url,
        headers: { Authorization: "Bearer ${TERMCO_MCP_TOKEN}" },
      },
    },
  });
}

/** Allow Termco MCP tools to use the server's single approval path. */
export function mcpSettings(): string {
  return JSON.stringify({ permissions: { allow: ["mcp__termco__*"] } });
}

/**
 * Tools the approval hook intercepts. Read-only tools (Read/Grep/Glob/…) are
 * auto-allowed by the backend without prompting. Mutating built-ins and other
 * mcp servers go through the user — but `mcp__termco__*` is EXCLUDED (negative
 * lookahead): our MCP server gates those itself, so letting the hook also
 * gate them produced a duplicate approval (one card in the run view, one in the
 * app overlay). Excluding them + `permissions.allow` leaves exactly one gate.
 */
const APPROVAL_MATCHER =
  "^(Write|Edit|MultiEdit|NotebookEdit|Bash|WebFetch|mcp__(?!termco__).*)$";

/** The PreToolUse hooks object bridging to our loopback approval server. */
function approvalHooksObject(endpoint: string, runId: string): Record<string, unknown> {
  const command = `curl -sS -X POST --data-binary @- '${endpoint}/permit?run=${encodeURIComponent(runId)}'`;
  return {
    PreToolUse: [
      {
        matcher: APPROVAL_MATCHER,
        // Keep this above the driver's approval wait so a pending card cannot
        // become a silent denial.
        hooks: [{ type: "command", command, timeout: 600 }],
      },
    ],
  };
}

/**
 * The single `--settings` blob for a run combines Termco's
 * permissions.allow when an MCP server is wired, plus the PreToolUse approval
 * hook when the run is in an ask mode. Returns null when neither applies.
 */
export function buildSettings(p: AgentRunStartParams): string | null {
  const settings: Record<string, unknown> = {};
  if (p.mcpUrl) settings.permissions = { allow: ["mcp__termco__*"] };
  // The approval hook is added per-TURN based on the CURRENT mode, not the
  // start mode — so switching autonomy mid-session actually takes effect. In
  // full-auto (bypass) nothing prompts, so the hook is omitted even though the
  // endpoint is provisioned; switch to ask/acceptEdits and the next turn adds
  // it because the endpoint is always available for this backend.
  if (p.approvalEndpoint && p.permissionMode !== "bypass") {
    settings.hooks = approvalHooksObject(p.approvalEndpoint, p.runId);
  }
  return Object.keys(settings).length ? JSON.stringify(settings) : null;
}

function parseLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  switch (obj.type as string | undefined) {
    case "system":
      return obj.subtype === "init"
        ? [
            {
              type: "session",
              sessionId: String(obj.session_id ?? ""),
              model: typeof obj.model === "string" ? obj.model : undefined,
              cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
            },
          ]
        : [];

    case "assistant":
      return assistantEvents(contentArray(obj));

    case "user":
      return userEvents(
        (obj.message as Record<string, unknown> | undefined)?.content ?? obj.content,
      );

    case "result":
      return [
        {
          type: "turn-end",
          usage: usageOf(obj.usage),
          costUsd:
            typeof obj.total_cost_usd === "number"
              ? obj.total_cost_usd
              : typeof obj.cost_usd === "number"
                ? (obj.cost_usd as number)
                : undefined,
        },
      ];

    default:
      return [];
  }
}

function usageOf(u: unknown): AgentUsage | undefined {
  if (!u || typeof u !== "object") return undefined;
  const usage = u as Record<string, unknown>;
  return {
    inputTokens: numeric(usage.input_tokens),
    outputTokens: numeric(usage.output_tokens),
    cachedInputTokens: numeric(usage.cache_read_input_tokens),
  };
}

function numeric(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
// Owned by the coding-agent-native provider plugin.
