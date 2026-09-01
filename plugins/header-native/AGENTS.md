# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and React from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- All default header markup, icons, menus, and interaction behavior belongs here.
- Use the supplied header runtime for workspace actions and declared capabilities for shared providers.
