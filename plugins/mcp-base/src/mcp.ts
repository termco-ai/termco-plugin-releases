export interface McpTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface McpConnectOptions {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  transport?: "http" | "sse";
  oauthClientId?: string;
  oauthScopes?: string;
}

export type McpConnectResult = { ok: true; tools: McpTool[] } | { error: string };

export interface McpClientsCapability {
  connect(options: McpConnectOptions): Promise<McpConnectResult>;
  disconnect(name: string): void;
  clearOAuth(name: string): Promise<void>;
  status(name: string): { connected: boolean; tools: McpTool[] };
  call(name: string, tool: string, argumentsValue: unknown): Promise<unknown>;
  disconnectAll(): void;
  liveResources(): Array<{ id: string; label: string }>;
}
