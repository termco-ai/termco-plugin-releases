# Git provider ownership

- This folder owns all Git execution, parsing, repository operations, validation, and behavior tests.
- Remote Git must consume `ssh.client`; never open a second SSH connection.
- Workspace authorization and file reads must use public capabilities.
- Spawn Git with argument arrays, hardened environment variables, bounded output, and timeouts.
