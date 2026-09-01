# Default Status Bar

This source-owning plugin provides the complete `ui.statusbar.items` root:
footer chrome, readiness, workspace environment, path navigation, LSP,
privacy, agent state, and the AI action. The shell only mounts the selected
root contribution; it does not own the product layout or presentation.

Copy the whole folder, change its id, declare `replaces: "statusbar-native"`,
and edit or remove any item under `src/`.
