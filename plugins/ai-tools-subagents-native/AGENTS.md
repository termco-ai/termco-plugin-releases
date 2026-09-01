# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Own subagent prompts, types, read-only tool policy, progress, and orchestration.
- Consume `ai.inference` for execution and `ai.toolsets` for reusable tools.
- Never import chat stores, model SDKs, another plugin's source, or legacy tools.
