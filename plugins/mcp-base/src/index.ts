export * from "./mcp";
export * from "./mcpServer";

export const MCP_CLIENTS_SERVICE = "mcp.clients" as const;
export const MCP_SERVER_SERVICE = "mcp.server" as const;

declare module "@termco/kernel" {
  interface Services {
    [MCP_CLIENTS_SERVICE]: import("./mcp").McpClientsCapability;
    [MCP_SERVER_SERVICE]: import("./mcpServer").McpServerCapability;
  }
}
