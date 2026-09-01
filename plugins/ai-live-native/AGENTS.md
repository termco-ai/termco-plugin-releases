# AI Live Workspace Provider

- Keep this plugin product-neutral and free of terminal/browser/workspace
  implementations.
- Preserve newest-contribution-per-method precedence and idempotent disposal.
- Missing contributions must use defined non-crashing fallbacks.
- Consumers use `ai.live`; producers use only `ai.live-contributions`.
