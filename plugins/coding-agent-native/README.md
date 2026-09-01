# Coding Agents

Default dual-process plugin for coding agents. It owns the application-wide
external-agent supervisors as well as the complete Agents dock UI.

It provides:

- `agents.coding-sessions`: supervision, approvals, normalized event streams,
  history, checkpoints, local and SSH execution, persistence, and cleanup.
- `agents.coding-ui`: renderer state and actions used by shell integrations.
- `ui.ai-dock.views:agents`: the source-owned Agents dock contribution.

It consumes the shared SSH, MCP server, trace, and application-event providers.
Copy this entire directory, change its id, and declare
`replaces: "coding-agent-native"` to replace both the shared provider and its UI
while the application is running. Replacing the provider requires confirmation
because active coding and SSH-backed sessions must be stopped first.
