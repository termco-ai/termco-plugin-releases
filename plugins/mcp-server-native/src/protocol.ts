/**
 * The MCP JSON-RPC protocol handler — pure over injected deps (auth, tool
 * surface, tool dispatch, rig resolution), so the whole request lifecycle is
 * unit-tested without an HTTP server or a live renderer.
 *
 * Transport is streamable-HTTP with plain-JSON responses (this tool-only
 * server never opens an SSE stream). One JSON-RPC message per POST body.
 *
 * Session model: dual-mode, forward-compatible with the stateless direction
 * (the 2026-07-28 RC removes sessions entirely). A client that runs the
 * `initialize` handshake gets an `Mcp-Session-Id` and may carry per-session
 * state (an unscoped user token's selected rig), as supported clients do. A
 * stateless client may skip initialize and POST tool calls
 * directly: token-scoped calls (run tokens / rig-pinned user tokens) resolve
 * with no session state at all. Auth is a bearer token on EVERY request
 * (checked by the caller, `handleRequest` receives the resolved identity).
 */

import type { TokenIdentity } from "./tokens";

/**
 * Protocol versions this server speaks, newest first. `initialize` negotiates:
 * if the client asks for one we support, we echo it; otherwise we answer with
 * our latest (`LATEST_PROTOCOL_VERSION`) and the client decides whether to
 * proceed (per the MCP lifecycle spec). Transport, session management and this
 * negotiation are identical across all these revisions — only feature surface
 * (elicitation, structured output, OIDC discovery, …) differs, none of which
 * this tool-only server uses. The 2026-07-28 "stateless core" is still an RC.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
] as const;

export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** Pick the version to answer `initialize` with: the client's if we support
 * it, else our latest. */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

/** A tool as the server advertises it (JSON Schema input). */
export type McpToolDef = {
  name: string;
  description: string;
  inputSchema: unknown;
};

/** The rig a call resolved to, plus how (for approval-card labeling). */
export type ResolvedRig = { rigId: string; rigName: string };

export type ProtocolDeps = {
  serverVersion: string;
  /** App-control tools this identity may see (run tokens typically see more).
   * The core prepends `get_context` and appends `select_rig` (the latter only
   * when the identity's rig is not already fixed). */
  toolsFor: (identity: TokenIdentity) => McpToolDef[];
  /** The two always-present server-side tool declarations. */
  builtinTools: { getContext: McpToolDef; selectRig: McpToolDef };
  /** Resolve the rig for a call: run tokens are fixed; user tokens resolve
   * from a per-session cwd (set via `select_rig`) or their pinned rig. Returns
   * null when a user token has no rig yet (→ teach-error `rig-unresolved`). */
  resolveRig: (identity: TokenIdentity, sessionCwd: string | null) => ResolvedRig | null;
  /** Execute a tool against a rig; returns the tool result or throws a
   * McpToolError. `select_rig` / `get_context` are handled here, not dispatched. */
  callTool: (args: {
    identity: TokenIdentity;
    rig: ResolvedRig;
    toolName: string;
    input: Record<string, unknown>;
  }) => Promise<unknown>;
  /** Mint a session id at `initialize`. */
  newSessionId: () => string;
};

/** Per-session state the server keeps between requests. */
export type McpSession = {
  id: string;
  identity: TokenIdentity;
  /** Working directory an unscoped user token selected (rig resolution). */
  cwd: string | null;
  /** The version negotiated at initialize (echoed by the client on later
   * requests via the MCP-Protocol-Version header; we track it but stay lenient
   * so a client that omits it isn't rejected). */
  protocolVersion: string;
};

/** A JSON-RPC message (request or notification). */
type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

/** What the HTTP layer should send back. `sessionId` is set on initialize so
 * the layer can add the `Mcp-Session-Id` header. `status` lets us map
 * protocol-level conditions (unknown session → 404) to HTTP. */
export type ProtocolResponse = {
  status: number;
  /** JSON body, or null for a 202 (notification) with no body. */
  body: unknown | null;
  sessionId?: string;
};

/** A tool error the model should see (vs. a transport/JSON-RPC error). */
export class McpToolError extends Error {
  constructor(
    message: string,
    readonly code = "tool-error",
  ) {
    super(message);
  }
}

const JSONRPC = "2.0";

function rpcError(id: JsonRpcMessage["id"], code: number, message: string): ProtocolResponse {
  return { status: 200, body: { jsonrpc: JSONRPC, id: id ?? null, error: { code, message } } };
}

function rpcResult(id: JsonRpcMessage["id"], result: unknown): ProtocolResponse {
  return { status: 200, body: { jsonrpc: JSONRPC, id: id ?? null, result } };
}

export function createProtocol(deps: ProtocolDeps) {
  const sessions = new Map<string, McpSession>();

  /** Handle one JSON-RPC message. `identity` is the already-authenticated
   * caller; `sessionId` is the `Mcp-Session-Id` header (absent on initialize). */
  async function handleRequest(
    identity: TokenIdentity,
    sessionId: string | undefined,
    msg: JsonRpcMessage,
  ): Promise<ProtocolResponse> {
    const method = msg.method;
    const isNotification = msg.id === undefined || msg.id === null;

    if (method === "initialize") {
      const id = deps.newSessionId();
      // Negotiate: echo the client's requested version if we support it, else
      // answer with our latest (the client then decides whether to proceed).
      const version = negotiateProtocolVersion(msg.params?.protocolVersion);
      sessions.set(id, { id, identity, cwd: null, protocolVersion: version });
      return {
        ...rpcResult(msg.id, {
          protocolVersion: version,
          capabilities: { tools: {} },
          serverInfo: { name: "termco", version: deps.serverVersion },
        }),
        sessionId: id,
      };
    }

    if (method === "notifications/initialized") {
      return { status: 202, body: null };
    }

    // Session resolution, forward-compatible with the stateless direction
    // (2026-07-28 RC removes Mcp-Session-Id entirely). Two paths:
    //  - A client that DID the handshake sends its session id → use it (this is
    //    what supported clients do, so it must keep working).
    //  - A stateless client sends NO session id → we operate on a transient,
    //    non-persisted context. Token-scoped calls (run tokens / rig-pinned
    //    user tokens) fully resolve without any session state; only an unscoped
    //    user token's `select_rig` cwd needs a real session to stick.
    // A session id that is SENT but unknown/expired is still a 404 → re-init.
    let session: McpSession;
    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing || !sameIdentity(existing.identity, identity)) {
        return { status: 404, body: null };
      }
      session = existing;
    } else {
      session = { id: "", identity, cwd: null, protocolVersion: LATEST_PROTOCOL_VERSION };
    }

    if (method === "ping") return rpcResult(msg.id, {});

    if (method === "tools/list") {
      // get_context always; select_rig only when the rig isn't already fixed
      // (run tokens and rig-pinned user tokens don't need it).
      const rigFixed =
        identity.kind === "run" || Boolean((identity as { rigId?: string }).rigId);
      const tools = [
        deps.builtinTools.getContext,
        ...deps.toolsFor(identity),
        ...(rigFixed ? [] : [deps.builtinTools.selectRig]),
      ];
      return rpcResult(msg.id, { tools });
    }

    if (method === "tools/call") {
      const name = String(msg.params?.name ?? "");
      const input = (msg.params?.arguments ?? {}) as Record<string, unknown>;

      // `select_rig` sets the session cwd for rig resolution (unscoped user
      // tokens). Requires a real session to persist across calls — a stateless
      // caller (no session id) can't use it; it should pin the token instead.
      if (name === "select_rig") {
        const cwd = typeof input.cwd === "string" ? input.cwd : "";
        session.cwd = cwd || null;
        const rig = deps.resolveRig(identity, session.cwd);
        if (!rig) {
          return rpcResult(
            msg.id,
            toolText(`No rig matches "${cwd}". Open it in the app, or pass the exact rig root.`),
          );
        }
        if (!session.id) {
          // Transient (stateless) call — the selection won't persist.
          return rpcResult(
            msg.id,
            toolError(
              "stateless-no-session",
              `Rig "${rig.rigName}" matched, but this connection sent no session id so the selection can't persist. Initialize a session first, or ask the user to pin this token to a rig.`,
            ),
          );
        }
        return rpcResult(msg.id, toolText(`Active rig set to "${rig.rigName}".`));
      }

      const rig = deps.resolveRig(identity, session.cwd);
      if (!rig) {
        return rpcResult(
          msg.id,
          toolError(
            "rig-unresolved",
            "No rig selected. Call `select_rig` with your working directory " +
              "(absolute path) first — or, for a stateless connection, ask the " +
              "user to pin this token to a rig so no session is needed.",
          ),
        );
      }

      try {
        const result = await deps.callTool({ identity, rig, toolName: name, input });
        return rpcResult(msg.id, normalizeToolResult(result));
      } catch (err) {
        const code = err instanceof McpToolError ? err.code : "tool-error";
        const message = err instanceof Error ? err.message : String(err);
        return rpcResult(msg.id, toolError(code, message));
      }
    }

    if (isNotification) return { status: 202, body: null };
    return rpcError(msg.id, -32601, `method not found: ${method}`);
  }

  /** Drop a session (DELETE /mcp). */
  function endSession(sessionId: string): boolean {
    return sessions.delete(sessionId);
  }

  return { handleRequest, endSession, _sessionCount: () => sessions.size };
}

export type Protocol = ReturnType<typeof createProtocol>;

function sameIdentity(a: TokenIdentity, b: TokenIdentity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "run" && b.kind === "run") return a.token === b.token;
  if (a.kind === "user" && b.kind === "user") return a.id === b.id;
  return false;
}

/** MCP tool result shape: `{ content: [{type:"text", text}] }`. A tool that
 * already returns that shape passes through; anything else is JSON-stringified
 * into a text block. */
function normalizeToolResult(result: unknown): unknown {
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    return result;
  }
  const text =
    typeof result === "string" ? result : JSON.stringify(result ?? null, null, 2);
  return { content: [{ type: "text", text }] };
}

function toolText(text: string): unknown {
  return { content: [{ type: "text", text }] };
}

/** A tool-level error result (isError:true) the model can read and retry. */
function toolError(code: string, message: string): unknown {
  return {
    isError: true,
    content: [{ type: "text", text: `[${code}] ${message}` }],
  };
}
// Owned by the mcp-server-native provider plugin.
