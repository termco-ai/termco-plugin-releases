# Plugin boundary

This plugin owns the complete default `storage.application` implementation.

- Do not import Termco application source or another plugin.
- Preserve write ordering and atomic replacement in behavior tests.
- Persistent format changes require an explicit migration before activation.
