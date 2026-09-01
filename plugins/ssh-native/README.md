# Native SSH Runtime

This source-owning provider implements `ssh.client`. One provider owns every
long-lived SSH server connection, remote RPC channel, forward process,
deployment cache, host configuration, and remote shell-integration upload.

PTY, files, Git, containers, shell, LSP, coding agents, and port-forwarding
consumers all use this shared capability. Replacing it lists and destroys the
affected SSH sessions and forwards only after explicit confirmation.
