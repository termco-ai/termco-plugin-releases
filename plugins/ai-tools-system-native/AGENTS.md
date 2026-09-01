# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `desktop.integration` and `terminal.history`; never invoke private IPC.
- Publish AI-SDK-independent JSON-schema tool definitions through `ai.tools`.
- Keep tool policy, descriptions, path handling, execution, and tests here.
