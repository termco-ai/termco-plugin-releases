/**
 * The seam between the MCP server core (Phase 5) and the tool bridge (Phase 6).
 * The core knows how to speak the protocol and resolve rigs; it does NOT know
 * which app tools exist or how to run them. A `ToolProvider` supplies both, so
 * the bridge can be developed and swapped without touching the transport.
 *
 * Two server-side tools always exist regardless of the provider: `get_context`
 * (orientation) and `select_rig` (rig selection, handled in the protocol
 * layer). The provider adds the app-control surface (focus_view, terminal_run,
 * browser, …).
 */

import type { McpToolDef, ResolvedRig } from "./protocol";
import type { TokenIdentity } from "./tokens";

export type ToolProvider = {
  /** App-control tools this identity may call (excludes get_context/select_rig,
   * which the core owns). Run tokens typically see more than user tokens. */
  listTools: (identity: TokenIdentity) => McpToolDef[];
  /** Run one app-control tool against a rig. Throws McpToolError on failure. */
  callTool: (args: {
    identity: TokenIdentity;
    rig: ResolvedRig;
    toolName: string;
    input: Record<string, unknown>;
  }) => Promise<unknown>;
};

/** A provider with no app-control tools — the core still serves get_context /
 * select_rig. Used until the Phase 6 bridge registers the real one. */
export const EMPTY_TOOL_PROVIDER: ToolProvider = {
  listTools: () => [],
  callTool: async ({ toolName }) => {
    throw new Error(`unknown tool: ${toolName}`);
  },
};

/** The always-present `select_rig` declaration (handled in the protocol core;
 * shown only to identities whose rig is NOT already fixed). */
export const SELECT_RIG_TOOL: McpToolDef = {
  name: "select_rig",
  description:
    "Point subsequent app-control tool calls at a rig by naming your working " +
    "directory (its absolute path). Call this first if a tool returns the " +
    "`rig-unresolved` error.",
  inputSchema: {
    type: "object",
    properties: {
      cwd: { type: "string", description: "Absolute path of your working directory." },
    },
    required: ["cwd"],
    additionalProperties: false,
  },
};

/** The always-present `get_context` declaration. */
export const GET_CONTEXT_TOOL: McpToolDef = {
  name: "get_context",
  description:
    "Return the currently-targeted rig (id, name, root) and the Termco app " +
    "version — a cheap orientation call.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};
// Owned by the mcp-server-native provider plugin.
