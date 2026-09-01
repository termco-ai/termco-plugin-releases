# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- Do not import `src/`, `electron/`, `@/`, or another plugin directory.
- Keep adapters, process supervision, approvals, history, checkpoints, renderer
  state, UI, and tests here.
- Reuse SSH, MCP server, current session history, and event providers through declared capabilities.
- Journal behavioral output only through current session contracts at the fidelity the external backend actually exposes.
- Keep shell integration generic: contribute through `ui.ai-dock.views` and
  communicate with other plugins through capabilities or application events.
- A copied replacement must remain runnable from user data without depending on
  this repository's private source tree or undeclared runtime packages.
