# Language Servers

Default provider for `lsp.sessions`. It owns the one application-wide fleet of
local and SSH language servers, document synchronization, diagnostics,
completion, navigation, formatting, installation, crash recovery, and cleanup.

Copy this directory, change its id, and declare `replaces: "lsp-native"` to
ship a complete replacement while editor and AI consumers keep the same public
capability contract.
