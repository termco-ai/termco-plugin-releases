# Workspace Environment

Default provider for `workspace.environment@1`. It owns the selected local,
WSL, or SSH environment and coordinates safe transitions through the selected
workspace registry, SSH, rig, tab, and terminal providers.

Copying and replacing this plugin changes workspace-selection policy without
copying any of the shared runtimes it consumes.
