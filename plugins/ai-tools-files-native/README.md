# AI Tools: Files

This plugin owns file reading, search, exact editing, and mutation tools. It
consumes `workspace.files`, so local, WSL, and SSH operations use the same
authorized provider, file events, and remote connection as the rest of the
application. Session read hashes and plan-review queuing arrive through the
public `AiToolRuntime`.

For protected system directories such as `/etc/nginx`, the agent can call
`request_directory_access` with an absolute canonical directory, the exact target
label from the access error, and a reason. The normal approval UI must receive an
explicit user decision, including in auto-run mode. Approved reads, directory
listings, metadata, grep, and glob can then use that directory and its descendants.

Grants belong to the current chat and local/WSL/SSH target. They survive subsequent
turns in that chat but are held only in memory: `revoke_directory_access`, plugin
reload, or app restart ends access. Grants do not override operating-system
permissions, credential-file restrictions, or mutation protections. Canonical
paths and search results are checked to prevent symlinks from expanding the scope.
