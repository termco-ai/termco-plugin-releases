# Shell provider ownership

- Keep all local session and background-process handles in this provider.
- Remote execution must use `ssh.client` and its shared connection pool.
- Working-directory authorization must use `workspace.registry`.
- Disposal kills every live background child and clears session state.
