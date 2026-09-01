# MCP provider ownership

- This folder owns the application-wide MCP client registry, transports, protocol, OAuth, token persistence, and tool calls.
- Store OAuth tokens through `secrets.application`; never expose them to renderers or tools.
- Open OAuth pages through `desktop.integration` and report progress through `events.application`.
- Replacement must disclose and close every live MCP connection.
