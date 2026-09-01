# Plugin boundary

- Import application APIs only from their owning `@termco/*-base` package and
  the generic `@termco/kernel` lifecycle surface.
- Inject `profile.transactions` and use its `PluginProfileApi`; never call
  private Electron IPC or legacy plugin-host.
- Source writes must target an editable copied plugin, never a bundled source.
- Keep catalog results self-describing: include categories, explanations,
  capabilities, dependencies, permissions, source, and selection reason.
- Reload only after edits; kernel errors must be returned to the user verbatim.
