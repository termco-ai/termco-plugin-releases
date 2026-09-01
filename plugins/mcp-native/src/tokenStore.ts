/**
 * Per-server OAuth token storage for remote MCP servers. One JSON blob per
 * server in the OS keychain (via the main-callable `secret*` helpers), keyed
 * `mcp-oauth:<server>`. Tokens live only in the main process — they never cross
 * to the renderer and there is no agent tool that can reach them.
 */
import { secretStorage } from "./runtime";

/** Must match KEYRING_SERVICE in the selected model registry so all app
 * secrets share one keychain service, distinguished only by account. */
const KEYRING_SERVICE = "termco-ai";

export type McpOAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when the access token expires (absent = unknown/no expiry). */
  expiresAt?: number;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
  authorizationEndpoint: string;
  scopes?: string;
};

const account = (server: string) => `mcp-oauth:${server}`;

export async function loadTokens(
  server: string,
): Promise<McpOAuthTokens | null> {
  const raw = await secretStorage().get(
    KEYRING_SERVICE,
    account(server),
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as McpOAuthTokens;
  } catch {
    return null;
  }
}

export async function saveTokens(
  server: string,
  tokens: McpOAuthTokens,
): Promise<void> {
  await secretStorage().set(
    KEYRING_SERVICE,
    account(server),
    JSON.stringify(tokens),
  );
}

export async function clearTokens(server: string): Promise<void> {
  await secretStorage().delete(KEYRING_SERVICE, account(server));
}
