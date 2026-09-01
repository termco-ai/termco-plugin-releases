# Plugin boundary

This plugin owns application-wide sidebar navigation state and persistence.

- Do not import header, sidebar view, shell, or host application source.
- The shell may bind only the narrow public panel handle.
- Consumers select or show views through the public capability.
