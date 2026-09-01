# Editor Surface Ownership

- All editor product behavior and UI stays inside this folder.
- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Never import `src/`, `electron/`, `@/`, `@termco/app`, or another plugin.
- Keep capability access behind `src/runtime.ts`; internal editor modules may
  use the plugin-local adapters.
- Preserve editor behavior and visual design during architecture changes.
