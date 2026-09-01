# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep the complete workspace-search UI and behavior inside this folder.
- Access files only through the declared `workspace.files` capability.
