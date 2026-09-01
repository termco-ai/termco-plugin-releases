# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `workspace.files`; never invoke private IPC or renderer stores.
- Resolve every operation against the chat's workspace environment.
- Preserve sensitive-path and canonical/symlink defenses.
- Keep every mutation approval-gated and enforce read-before-edit.
- Send plan-mode mutations through `AiToolRuntime.queueFileMutation`.
- Publish AI-SDK-independent JSON schemas through `ai.tools`.
