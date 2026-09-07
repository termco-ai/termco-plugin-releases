# Native SSH Runtime

This source-owning provider implements `ssh.client`. One provider owns every
long-lived SSH server connection, remote RPC channel, forward process,
deployment cache, host configuration, and remote shell-integration upload.

PTY, files, Git, containers, shell, LSP, coding agents, and port-forwarding
consumers all use this shared capability. Replacing it lists and destroys the
affected SSH sessions and forwards only after explicit confirmation.

Password-protected hosts and encrypted private keys open an SSH authentication
dialog in Termco. **Save in Termco** is enabled by default; credentials use the
selected encrypted secret store and are reused for reconnects, terminals,
remote setup, coding agents, and port forwards. If a saved credential is rejected,
Termco asks for it again. Verification codes are never saved. Unknown host keys
require explicit confirmation according to the user's OpenSSH configuration.
