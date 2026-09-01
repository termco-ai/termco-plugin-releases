# Plugin boundary

- Import lifecycle APIs from `@termco/kernel` and product contracts from their owning `@termco/*-base` packages; `termco-plugin.json` is the dependency source of truth.
- Own model execution, provider SDK selection, credentials, endpoint rules,
  HTTP adaptation, client reuse, and AI-SDK tool adaptation here.
- Never import chat stores, settings stores, or another plugin's source.
- Keep prompts and feature-specific orchestration in consumer plugins.
