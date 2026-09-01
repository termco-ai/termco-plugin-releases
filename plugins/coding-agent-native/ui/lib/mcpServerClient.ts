/** Source-owned by the coding-agent-native plugin.
 * Renderer-side IPC client for user-token and agent registration workflows.
 * Rig mirroring is source-owned by plugins/mcp-rig-sync through mcp.server.
 */

import { codingAgentUiRuntime } from "../runtime";

function invoke<T>(command: string, payload: Record<string, unknown>): Promise<T> {
  return codingAgentUiRuntime().mcp.invoke(command, payload) as Promise<T>;
}

/** A user token as shown in settings (never carries the plaintext/hash). */
export type McpUserTokenInfo = {
  id: string;
  label: string;
  rigId: string | null;
  autoApprove: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

/** Create a user token. Returns the ONE-TIME plaintext + a config URL. */
export function createMcpUserToken(opts: {
  label: string;
  rigId?: string | null;
  autoApprove?: boolean;
}): Promise<{ token: string; info: McpUserTokenInfo; url: string | null }> {
  return invoke("mcp_token_create", opts) as Promise<{
    token: string;
    info: McpUserTokenInfo;
    url: string | null;
  }>;
}

export function listMcpUserTokens(): Promise<McpUserTokenInfo[]> {
  return invoke("mcp_token_list", {}) as Promise<McpUserTokenInfo[]>;
}

export function revokeMcpUserToken(id: string): Promise<{ ok: boolean }> {
  return invoke("mcp_token_revoke", { id }) as Promise<{ ok: boolean }>;
}

/** Register the termco server with an external agent CLI (or get a snippet). */
export function registerMcpAgent(
  backend: "claude" | "codex" | "other",
  token: string,
): Promise<{ ok: boolean; output?: string; snippet?: string; error?: string }> {
  return invoke("mcp_register_agent", { backend, token }) as Promise<{
    ok: boolean;
    output?: string;
    snippet?: string;
    error?: string;
  }>;
}
