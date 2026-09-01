# Container provider ownership

- This folder owns runtime discovery, parsing, operations, logs, and validation.
- Remote operations consume `ssh.client`; never create another SSH connection.
- Spawn binaries with argument arrays and bounded output only.
