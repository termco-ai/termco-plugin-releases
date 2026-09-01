# Workspace Rigs Native

The default source-owning provider for `workspace.rigs`. It owns one shared,
persisted rig model. Header, workspace, command, terminal, and AI plugins can be
copied or replaced independently while consuming the same selected provider.

The provider is the only owner of rig identity, ordering, selection, workspace
bindings, and persistence. Saved tab layouts belong to `workspace.tabs`.
