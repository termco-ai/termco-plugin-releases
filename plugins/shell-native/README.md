# Shell Execution

This source-owning provider implements `shell.execution`. It owns local session
and background-process state while delegating all remote work to the one shared
`ssh.client` provider.
