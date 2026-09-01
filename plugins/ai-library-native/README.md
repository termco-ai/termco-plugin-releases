# AI Library

Default provider for `ai.library`. It owns the shared agent catalogue, active
persona, snippets, skills, MCP configuration, durable state, and reconciliation
with the single application-wide `mcp.clients` provider.

Consumers use the capability and `ai.library.changed` event. They never import
this plugin, coordinate persistence, or create their own MCP connections.
