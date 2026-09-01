# Session query provider ownership

- Query only the current `session.history` service.
- Keep indexes rebuildable from canonical session events and revisions.
- Never parse files directly or introduce importers, aliases, fallback readers, or old-format terminology.
- Preserve stable pagination, cancellation, redaction, and exact event identity.
- Keep model-facing access separate from the human query capability unless explicitly authorized.

