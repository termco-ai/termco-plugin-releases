# MCP Workspace Mirror

This plugin mirrors the current rig list into the one selected `mcp.server`
provider. The provider owns server state, tokens, and cleanup; this plugin owns
only the application workflow that keeps workspace identity synchronized.

Copy this folder to change which rigs external agents can resolve without
copying or reconnecting the MCP server itself.
