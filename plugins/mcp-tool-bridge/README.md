# MCP Tool Bridge

This plugin owns the renderer-side MCP bridge lifecycle: it publishes the tool
surface, registers the current renderer as an executor, handles tool requests,
and queues approval and managed-run interaction events.

It consumes the one selected `mcp.server` provider, so copying or replacing
this workflow never starts a second MCP server or duplicates access tokens.
The background runtime currently adapts the still-migrating AI tool catalogue
and queues; those become ordinary capabilities when the AI session/tool plugins
are migrated.
