/**
 * MCP server manager + IPC. Keeps one stdio client per server name (persistent
 * across chats), and exposes connect / disconnect / call / status to the
 * renderer. Config parsing lives renderer-side (it reads the workspace
 * `.mcp.json`); this layer is transport-only.
 */
import { McpStdioClient } from "./client";
import { type AuthProvider, McpHttpClient } from "./http";
import { authorizeInteractive, refreshGrant } from "./oauth";
import { loadTokens, type McpOAuthTokens, saveTokens } from "./tokenStore";
import type { McpTool, McpTransport } from "./transport";
import { applicationEvents, desktopIntegration } from "./runtime";

/** Live client registry, one transport per server name. The provider exposes
 * this shared state only through the selected `mcp.clients` capability. */
export const clients = new Map<string, McpTransport>();

export type McpConnectResult =
  | { ok: true; tools: McpTool[] }
  | { error: string };

type ConnectPayload = {
  name: string;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // remote
  url?: string;
  headers?: Record<string, string>;
  transport?: "http" | "sse";
  // remote OAuth (optional — DCR is used when clientId is absent)
  oauthClientId?: string;
  oauthScopes?: string;
};

function hasStaticAuthHeader(headers?: Record<string, string>): boolean {
  return !!headers && Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

/**
 * Build an OAuth auth provider for a remote server: supply the stored access
 * token, and on a 401 refresh it (or run the interactive browser flow), then
 * persist. Tokens stay in the keychain — the renderer/agent never see them.
 */
async function buildAuthProvider(p: ConnectPayload): Promise<AuthProvider> {
  let tokens: McpOAuthTokens | null = await loadTokens(p.name);
  const url = p.url ?? "";
  return {
    currentToken: () => tokens?.accessToken,
    handleUnauthorized: async (wwwAuth) => {
      if (tokens?.refreshToken) {
        try {
          tokens = await refreshGrant(url, tokens);
          await saveTokens(p.name, tokens);
          return tokens.accessToken;
        } catch {
          // refresh dead — fall through to a fresh interactive sign-in
        }
      }
      try {
        tokens = await authorizeInteractive(
          url,
          { clientId: p.oauthClientId, scopes: p.oauthScopes, wwwAuth },
          {
            openBrowser: (target) => desktopIntegration().openUrl(target),
            onProgress: (state) => applicationEvents().emit("mcp-oauth://progress", { server: p.name, state }),
          },
        );
        await saveTokens(p.name, tokens);
        return tokens.accessToken;
      } catch {
        return null;
      }
    },
  };
}

/** Pick a transport by config shape: a `url` is remote HTTP, else local stdio. */
async function makeTransport(p: ConnectPayload): Promise<McpTransport> {
  if (p.url) {
    // Static Authorization header wins and suppresses OAuth; otherwise attach an
    // OAuth provider that only kicks in when the server answers 401.
    const auth = hasStaticAuthHeader(p.headers)
      ? undefined
      : await buildAuthProvider(p);
    return new McpHttpClient({
      url: p.url,
      headers: p.headers,
      mode: p.transport ?? "auto",
      auth,
    });
  }
  const client = new McpStdioClient();
  // stdio's connect() takes the spawn args; wrap it to the McpTransport shape.
  const command = p.command ?? "";
  const args = p.args ?? [];
  const env = p.env;
  return {
    connect: () => client.connect(command, args, env),
    listTools: () => client.listTools(),
    callTool: (n, a) => client.callTool(n, a),
    disconnect: () => client.disconnect(),
    get connected() {
      return client.connected;
    },
  };
}

export async function connect(p: ConnectPayload): Promise<McpConnectResult> {
  clients.get(p.name)?.disconnect();
  const transport = await makeTransport(p);
  try {
    const tools = await transport.connect();
    clients.set(p.name, transport);
    return { ok: true, tools };
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

export function disconnectAllMcp(): void {
  for (const c of clients.values()) c.disconnect();
  clients.clear();
}
