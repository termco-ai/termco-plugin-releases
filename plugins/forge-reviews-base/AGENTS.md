# Forge review contract boundary

- Keep hosted-review concepts separate from local Git operations.
- Public values must remain JSON-safe across the main/renderer transport.
- Provider-specific behavior is represented with feature flags, never invented
  as one false universal API.
- Never expose provider credentials or CLI configuration contents.
