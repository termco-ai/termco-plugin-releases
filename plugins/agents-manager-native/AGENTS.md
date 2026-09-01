# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep the complete manager UI, navigation, search, dialogs, and view state here.
- Consume `ai.library`; never own a second agent/skill/MCP store or connection.
