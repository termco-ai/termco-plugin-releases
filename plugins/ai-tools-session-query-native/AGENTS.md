# Model session query tool ownership

- Keep this plugin opt-in and absent from shipped profiles.
- Consume only `session.query.model`; never read session storage or the human `session.query` capability.
- Derive caller identity from `AiToolRuntime`, never model input.
- Keep schemas and results fixed-budget, redacted, timeout-bound, and free of provider cursors, workspace paths, arbitrary limits, and raw file paths.
- Missing and unauthorized targets must remain indistinguishable.
