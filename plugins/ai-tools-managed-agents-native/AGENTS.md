# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Use only the session-scoped `AiToolRuntime` managed-agent methods.
- Own validation, control-character rejection, output tailing, tool copy, and
  approval rules here.
- Do not import terminal state, chat state, agent stores, or the AI SDK.
