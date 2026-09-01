# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Consume `containers.runtime` and `ssh.client`; never invoke private IPC.
- Target the chat context's workspace, not a global renderer store.
- Keep read tools automatic and lifecycle/forward mutations approval-gated.
- Publish AI-SDK-independent JSON schemas through `ai.tools`.
