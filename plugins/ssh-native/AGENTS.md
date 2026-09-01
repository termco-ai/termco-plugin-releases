# SSH provider ownership

- This folder owns the complete default `ssh.client` implementation and assets.
- Never import application windows, product modules, or another plugin's source.
- Consumers use only the public `ssh.client` capability.
- Keep one connection promise per connection id and multiplex all remote RPC.
- Disposal must await connection shutdown and synchronously kill forward children.
- Host-key verification follows the user's OpenSSH configuration; do not weaken it.
