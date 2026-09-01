# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Own the complete AI-tool definitions and JSON schemas in this folder.
- Keep `ask_ui` executor-free; the consuming chat UI supplies its tool output.
- Keep view data flat and bounded so models can reliably construct it.
- Do not import the chat renderer, its stores, Zod, or the concrete AI SDK.
