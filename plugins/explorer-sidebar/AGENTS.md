# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and React from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- All Explorer markup, icons, state, tree behavior, and filesystem workflows live here.
- Reuse declared providers; never build a second filesystem runtime.
