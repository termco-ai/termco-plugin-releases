# AI Tools: MCP

This plugin turns tools from connected, user-enabled MCP servers into AI tool
contributions. It consumes the one application-wide `mcp.clients` provider and
publishes `ai.tools:mcp`; it owns namespacing, schemas, approval gating, calls,
content normalization, and collision handling.

Copy this folder to change which MCP tools reach AI sessions or how their
results are normalized without copying MCP connections or chat state.
