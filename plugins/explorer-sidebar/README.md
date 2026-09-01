# Workspace Explorer

This source-owning plugin contains the default file explorer implementation:
its rail icon, lazy tree, filename search, filesystem updates, create/rename/
delete/move workflows, terminal reveal, AI attachment, active-file selection,
and command-palette action. It consumes the shared workspace filesystem and
preferences providers, so local, WSL, and SSH views use the same selected
application-wide backends.

Copy this directory and replace `explorer-sidebar` to change or completely
replace the Explorer without editing the application shell.
