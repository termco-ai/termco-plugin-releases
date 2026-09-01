# Native Workspace Registry

Default provider for `workspace.registry@1`. It owns the one application-wide
authorization set used by files, Git, PTY, shell, LSP, containers, and other
workspace consumers. It also owns local/WSL/SSH path semantics.

Copying and replacing this plugin swaps those policies for every consumer at
once; consumers never import its registry or path implementation.
