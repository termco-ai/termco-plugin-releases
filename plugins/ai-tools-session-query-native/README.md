# AI Tool: Session Query

Optional model-facing session recall. The plugin contributes five tools through
`ai.tools` and consumes only the caller-bound `session.query.model` capability.
It is intentionally absent from shipped profiles, so installing the bundle does
not expose prior-session data to models by default.

Caller session identity and timeout are host-derived. Model schemas contain no
workspace, path, cursor, limit, or storage-format controls.
