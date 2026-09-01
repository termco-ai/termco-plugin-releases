# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `git.repository`; never invoke Git IPC or spawn Git directly.
- Keep read operations automatic and mutation operations approval-gated.
- Publish AI-SDK-independent JSON-schema definitions through `ai.tools`.
