# Workspace Search

This plugin owns the complete Search in files sidebar feature: its icon,
debounced grep workflow, result rendering, errors, retry, and file navigation.
It consumes the shared `workspace.files` provider, so local and remote searches
reuse the application's one authorized file runtime.

Copy this directory, change its id, declare `replaces: "search-sidebar"`, and
edit `src/` to replace the running search feature without changing the host.
