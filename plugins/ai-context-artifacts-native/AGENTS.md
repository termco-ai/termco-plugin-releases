# Plugin boundary

- Own redaction, artifact ids, retention, paging, and canonical session-to-transcript rendering.
- Use `storage.application` and `session.history`; do not access application files directly.
- Keep ids path-free and return `null` for missing artifacts rather than guessing.
