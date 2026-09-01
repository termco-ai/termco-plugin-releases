# MCP Control Server

Default provider for `mcp.server`. It owns the one loopback MCP server shared by
managed and external agents, including tokens, rig routing, approval state,
renderer tool calls, discovery, and shutdown.

Copy this directory, change its id, and declare `replaces: "mcp-server-native"`
to replace the complete server without changing its consumers.
