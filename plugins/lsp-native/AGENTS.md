# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep server configuration, transports, sessions, formatting, and tests here.
- Share SSH and workspace file providers through declared capabilities.
