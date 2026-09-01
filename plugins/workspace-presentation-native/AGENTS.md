# Plugin boundary

This plugin owns only the shared selected-workspace presentation snapshot.

- Never import application source or another plugin.
- Keep product markup, navigation actions, tabs, rigs, terminals, and AI state
  in their owning plugins or capabilities.
- Import lifecycle types from `@termco/kernel` and presentation contracts and
  constants from their owning `@termco/*-base` packages.
- Expose reads and publication only through those injected services.
