# SSH Startup Resume

This plugin owns the startup policy for reconnecting restored SSH rigs. It
connects the active host first, staggers distinct remaining hosts, and consumes
the selected `ssh.client` provider so every feature shares one connection pool.

Copy this folder to change or remove the prewarming policy without replacing
the SSH implementation itself.
