/**
 * Shared MCP types + the transport contract. Both the stdio client and the
 * HTTP clients (Streamable HTTP / legacy SSE) implement `McpTransport`, so the
 * manager and IPC layer stay transport-agnostic — they only ever connect, list
 * tools, call a tool, and disconnect.
 */

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: unknown;
};

export type McpCallResult = {
  content: unknown;
  isError?: boolean;
};

export interface McpTransport {
  /** Spawn/open + handshake + list tools. Rejects (and cleans up) on failure. */
  connect(): Promise<McpTool[]>;
  listTools(): McpTool[];
  callTool(name: string, args: unknown): Promise<McpCallResult>;
  disconnect(): void;
  readonly connected: boolean;
}

/**
 * Auth failed for good (user cancelled, refresh + re-auth exhausted). Tagged so
 * the HTTP client's transport-fallback loop rethrows instead of trying the next
 * transport — a 401 is an auth problem, not a transport problem.
 */
export class McpAuthError extends Error {
  readonly isAuthError = true;
}

/** stdio has never rev'd; HTTP transports were standardized at 2025-03-26. */
export const STDIO_PROTOCOL_VERSION = "2024-11-05";
export const HTTP_PROTOCOL_VERSION = "2025-03-26";
export const REQUEST_TIMEOUT_MS = 30_000;
export const CONNECT_TIMEOUT_MS = 20_000;
