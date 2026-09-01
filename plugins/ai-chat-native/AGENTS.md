# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Own all chat/session state and UI here.
- Consume model, current session history, preferences, tools, files, and shell capabilities.
- Delegate every executable model tool to the selected `ai.tool-execution` owner; Chat owns presentation and provider transport, not tool execution or historical authority.
- Never import `src/`, `electron/`, or another plugin's source.
- Keep one shared session store across every chat surface and consumer.
