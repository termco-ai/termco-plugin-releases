# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Never create an MCP server, token store, or private event bus.
- Own renderer registration, event routing, and lifecycle cleanup here.
- Keep bridge behavior and tests inside this folder.
