# History provider ownership

- This folder owns shell-history parsing, indexing, ranking, executable discovery, and prewarming.
- Remote history must consume `ssh.client`; never create another remote connection.
- Keep filesystem scans asynchronous on the prewarm path and deterministic in tests.
