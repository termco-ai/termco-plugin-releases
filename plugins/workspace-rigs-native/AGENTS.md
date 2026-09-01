# Plugin boundary

This plugin owns the application-wide rig list, active rig, workspace bindings,
ordering, and persistence.

- Never import Termco application source or another plugin.
- Import lifecycle types from `@termco/kernel` and rig contracts and constants
  from their owning `@termco/*-base` packages.
- Expose rig state only through the injected `workspace.rigs` service.
- Keep UI, tabs, terminals, AI sessions, and workspace authorization outside
  this provider.
