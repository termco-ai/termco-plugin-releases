# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep the built-in catalogue, persistence rules, and MCP reconciliation here.
- Use shared storage, events, and MCP providers through declared capabilities.
- Keep the capability snapshot serializable across the main/renderer seam.
