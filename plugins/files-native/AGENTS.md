# Files provider ownership

- This folder owns local file IO, search, mutation, tree, and watch behavior.
- Remote operations must use `ssh.client`; never create an SSH connection.
- Path resolution and authorization must use `workspace.registry`.
- File events must use `events.application`.
- Close every watcher during plugin disposal.
