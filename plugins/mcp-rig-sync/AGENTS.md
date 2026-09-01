# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Never create a second MCP server or token store.
- Keep synchronization and its tests inside this folder.
