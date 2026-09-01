# Plugin boundary

- Consume only `lsp.sessions`; never start a language server here.
- Keep positions model-facing and 1-based, converting at the provider edge.
- These tools are read-only and never request mutation approval.
