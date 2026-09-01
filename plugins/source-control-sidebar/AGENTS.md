# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep all Source Control markup, icons, state, polling, and Git workflows here.
- Preserve the baseline component behavior and tests when changing adapters.
- Resolve the active rig and path through `workspace.tabs`; never cache the
  first rig as application-global Source Control state.
- Use only declared shared capabilities for Git, desktop, workspace, and AI
  operations. Do not implement those application-wide runtimes in this plugin.
- Keep `source-control.navigation` as the public seam used by other plugins.
