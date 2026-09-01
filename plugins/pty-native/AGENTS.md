# PTY provider ownership

- This folder is the complete default `terminal.pty` implementation.
- Shell integration files belong in `assets/` and are copied with the plugin.
- Keep all native PTY handles inside this provider.
- Consumers use `terminal.pty`; never expose or import this source folder.
- Disposal must synchronously begin closing every child session.
