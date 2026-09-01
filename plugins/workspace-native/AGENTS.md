# Plugin boundary

This plugin owns all default workspace authorization and path policy.

- Never import Termco application source or another plugin.
- Authorization is fail-closed for missing local paths.
- SSH paths are remote and must never be passed through local `realpath`.
- WSL distro names are validated before spawning `wsl.exe`.
