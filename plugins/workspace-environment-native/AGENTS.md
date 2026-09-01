# Plugin boundary

This plugin owns the selected renderer workspace environment and its safe
transitions.

- Consume only public capabilities; never import host application source or
  another plugin's files.
- Keep workspace authorization in `workspace.registry`, SSH connection state in
  `ssh.client`, rig identity in `workspace.rigs`, tabs in `workspace.tabs`, and
  terminal lifecycle in `terminal.sessions`.
- Preserve stale-result protection when resolving remote homes.
