# Plugin boundary

This plugin owns only the shared registration and lookup of tab search ports.

- Do not import a tab surface, header, workspace shell, or host application source.
- Surface plugins retain ownership of concrete terminal/editor/search handles.
- Consumers access targets only through the public `ui.surface-search` capability.
