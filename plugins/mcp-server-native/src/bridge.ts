/**
 * Main-process side of the MCP tool bridge. It is the `ToolProvider` the MCP
 * server core calls: `listTools` filters the renderer-published surface by
 * token kind; `callTool` forwards the call to a renderer window that can
 * execute it (the one hosting the app's live tab/terminal state) and awaits the
 * result over IPC.
 *
 * The actual tool code runs in the renderer (one truth with the internal chat)
 * — this module is pure routing + a pending-request table with a timeout.
 */

import type { WebContents } from "electron";
import type { McpToolDef, ResolvedRig } from "./protocol";
import { McpToolError } from "./protocol";
import type { TokenIdentity } from "./tokens";
import type { ToolProvider } from "./toolProvider";

/** One entry of the renderer-published surface. */
export type SurfaceEntry = {
  name: string;
  description: string;
  inputSchema: unknown;
  needsApproval: boolean;
  runOnly: boolean;
};

export type ToolReply =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: { code: string; message: string } };

/** How a call gates on approval — injected by Phase 7; a pass-through here. */
export type ApprovalGate = (args: {
  identity: TokenIdentity;
  rig: ResolvedRig;
  toolName: string;
  input: Record<string, unknown>;
  needsApproval: boolean;
  mandatory?: boolean;
}) => Promise<{
  allow: boolean;
  outcome?: "allowed-once" | "allowed-by-policy" | "rejected" | "cancelled" | "unavailable";
  responder?: "user" | "policy" | "parent";
  message?: string;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;

export function createMcpBridge(deps: {
  /** Windows able to execute tools; focused-most-recent wins ties. */
  senders: () => WebContents[];
  /** Send a `mcp:tool-request` to a chosen window. */
  send: (sender: WebContents, request: unknown) => void;
  /** Approval gate (Phase 7). Defaults to always-allow. */
  approvalGate?: ApprovalGate;
  timeoutMs?: number;
  /** Monotonic id source (injected for tests). */
  nextId?: () => string;
}) {
  let surface: SurfaceEntry[] = [];
  const pending = new Map<
    string,
    { resolve: (r: ToolReply) => void; timer: ReturnType<typeof setTimeout> }
  >();
  const approvalTickets = new Map<string, {
    identity: TokenIdentity;
    rig: ResolvedRig;
    toolName: string;
    input: Record<string, unknown>;
  }>();
  let idSeq = 0;
  const nextId = deps.nextId ?? (() => `mcpreq-${++idSeq}`);
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const approvalGate: ApprovalGate =
    deps.approvalGate ?? (async () => ({
      allow: true,
      outcome: "allowed-by-policy",
      responder: "policy",
    }));

  /** Renderer published its exposed surface. */
  function setSurface(entries: SurfaceEntry[]): void {
    surface = Array.isArray(entries) ? entries : [];
  }

  /** Resolve a pending call (from `mcp_tool_result`). */
  function resolveResult(reply: ToolReply): void {
    const entry = pending.get(reply.requestId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(reply.requestId);
    entry.resolve(reply);
  }

  const provider: ToolProvider = {
    listTools: (identity): McpToolDef[] =>
      surface
        .filter((e) => (identity.kind === "run" ? true : !e.runOnly))
        .map((e) => ({
          name: e.name,
          description: e.description,
          inputSchema: e.inputSchema,
        })),

    callTool: async ({ identity, rig, toolName, input }) => {
      const def = surface.find((e) => e.name === toolName);
      if (!def) throw new McpToolError(`unknown tool: ${toolName}`, "unknown-tool");
      if (identity.kind !== "run" && def.runOnly) {
        throw new McpToolError(
          `Tool "${toolName}" is only available to managed runs.`,
          "run-only",
        );
      }

      const sender = deps.senders()[0];
      if (!sender) {
        throw new McpToolError(
          `Rig "${rig.rigName}" is not loaded in any app window — open it in Termco.`,
          "rig-not-active",
        );
      }

      const requestId = nextId();
      approvalTickets.set(requestId, { identity, rig, toolName, input });
      const reply = await new Promise<ToolReply>((resolve) => {
        const timer = setTimeout(() => {
          if (pending.delete(requestId)) {
            resolve({
              requestId,
              ok: false,
              error: { code: "bridge-timeout", message: "the app did not respond in time" },
            });
          }
        }, timeoutMs);
        pending.set(requestId, { resolve, timer });
        deps.send(sender, { requestId, rigId: rig.rigId, toolName, input });
      }).finally(() => {
        approvalTickets.delete(requestId);
      });

      if (!reply.ok) throw new McpToolError(reply.error.message, reply.error.code);
      return reply.result;
    },
  };

  return {
    provider,
    setSurface,
    resolveResult,
    async requestApproval(input: {
      requestId: string;
      resolution: { action?: unknown; reason?: unknown };
    }) {
      const ticket = approvalTickets.get(input.requestId);
      if (!ticket) {
        return { allow: false, message: "tool approval ticket is unavailable" };
      }
      const action = String(input.resolution.action ?? "deny");
      if (action === "deny") {
        return { allow: false, message: "tool execution is denied by policy" };
      }
      if (action === "allow") {
        return {
          allow: true,
          outcome: "allowed-by-policy" as const,
          responder: "policy" as const,
        };
      }
      const reason = input.resolution.reason;
      const mandatory = Boolean(
        reason && typeof reason === "object" &&
          (reason as { kind?: unknown }).kind === "mandatory",
      );
      return approvalGate({
        ...ticket,
        needsApproval: true,
        mandatory,
      });
    },
    /** The approval-relevant flag for a tool (Phase 7 uses it). */
    needsApproval: (toolName: string) =>
      surface.find((e) => e.name === toolName)?.needsApproval ?? true,
    _pendingCount: () => pending.size,
  };
}

export type McpBridge = ReturnType<typeof createMcpBridge>;
// Owned by the mcp-server-native provider plugin.
