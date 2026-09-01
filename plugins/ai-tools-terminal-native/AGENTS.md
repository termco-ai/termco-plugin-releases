# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `shell.execution`; never invoke private IPC or import renderer stores.
- Use the public session-scoped `AiToolRuntime` for visible terminal and tabs.
- Keep shell execution and visible-terminal execution approval-gated.
- Own and clean up the per-chat shell-handle map on plugin replacement.
- Publish AI-SDK-independent JSON schemas through `ai.tools`.
