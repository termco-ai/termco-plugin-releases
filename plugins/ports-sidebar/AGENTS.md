# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep the complete Ports sidebar UI and behavior inside this folder.
- Manage connections and forwards only through the declared `ssh.client` capability.
- Use `desktop.integration` for operating-system actions.
