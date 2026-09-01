# AI Tools: Files

This plugin owns file reading, search, exact editing, and mutation tools. It
consumes `workspace.files`, so local, WSL, and SSH operations use the same
authorized provider, file events, and remote connection as the rest of the
application. Session read hashes and plan-review queuing arrive through the
public `AiToolRuntime`.
