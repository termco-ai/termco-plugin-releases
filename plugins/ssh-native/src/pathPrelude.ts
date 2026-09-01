/**
 * PATH prefix for non-interactive remote commands. `ssh host cmd` runs with the
 * sshd minimal PATH omits common user-local, npm-global, and nvm directories,
 * so
 * probes and spawns would miss user-local CLI installs (observed live:
 * a user-local executable may be invisible on a stock Ubuntu host. Prepended
 * rather than appended so a user-local install
 * wins over a stale system one, mirroring interactive shells.
 *
 * Pure POSIX sh — the remote login shell may be dash; no bashisms, no arrays.
 */
export const REMOTE_PATH_PRELUDE =
  'PATH="$HOME/.local/bin:$HOME/.claude/local:$HOME/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"; ' +
  'for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done; ' +
  "export PATH; ";
