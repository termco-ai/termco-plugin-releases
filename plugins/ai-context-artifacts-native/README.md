# AI Context Artifacts

Default provider for `ai.context-artifacts@1`. It owns one application-wide,
redacted store for large tool outputs and renders full chat transcripts from
the selected trace provider. AI sessions and transcript tools consume this
capability instead of creating their own files, caches, or trace readers.
