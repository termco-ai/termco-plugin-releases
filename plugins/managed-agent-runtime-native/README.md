# Managed Coding Agent Runtime

This source-owning plugin launches managed coding-agent terminals, installs the
shared agent hook, tracks bounded review state, routes completion back to the
owning AI session, and contributes the launch workflow to `ai.live`.

It consumes the selected application-wide session, terminal, activity, hooks,
and AI-live providers. Copy this complete folder and select the copy in a
profile to replace the workflow without duplicating PTY or AI session state.
