# Trajectory plugin

- Keep all feature implementation inside this folder.
- Import lifecycle types from `@termco/kernel` and service contracts and
  constants from their owning `@termco/*-base` packages.
- Never allocate event sequences or copy event prefixes. Forking delegates to
  `session.history`; reruns and workspace rewinds delegate to their owners.
- Keep the tab surface mounted so commands and navigation can open dialogs or
  the first trajectory tab before any trajectory tab already exists.
