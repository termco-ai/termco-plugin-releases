# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Own terminal renderer state, panes, blocks, styles, and behavior tests here.
- Consume the selected PTY, files, history, theme, shortcuts, Git, desktop, and AI-live capabilities.
- Provide the complete terminal footer factory; do not depend on an AI composer provider.
- Never import `src/`, `electron/`, `@/`, or another plugin directory.
- Never create a private PTY, SSH connection, history database, or preference store.
