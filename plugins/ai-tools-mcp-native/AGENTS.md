# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `mcp.clients`; never create private MCP connections.
- Contribute lazy tool builders; never create or import chat/session stores.
- Keep tool naming, execution, normalization, and tests in this folder.
