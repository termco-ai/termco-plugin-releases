# Terminal Surface

Owns the complete renderer-side terminal implementation: retained terminal
engines, panes, command blocks, search, completion, history integration, and
terminal-to-AI actions. It consumes the selected `terminal.pty` provider, so a
copied surface changes the terminal feature without creating a second PTY or
SSH connection pool.

The plugin also provides `terminal.workspace-footer`, the complete established
block-input footer factory. `terminal-workspace-footer-native` combines that
factory with the selected AI composer so terminal and AI providers remain
independently replaceable.

The visual implementation was moved without redesign. Exact comparison and
restoration against the `current` UI baseline is a separate mandatory migration
gate after real-plugin architecture certification.
