# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `workflows.library`; never import another plugin or private store.
- Keep tool definitions AI-SDK-independent and publish them through `ai.tools`.
- Require approval for terminal execution and workflow mutation.
- Keep catastrophic-command defense in depth inside this plugin.
