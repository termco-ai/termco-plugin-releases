# Agent-hook provider ownership

- This folder owns supported-agent definitions, hook commands, JSON merging, atomic writes, and status detection.
- Its renderer entrypoint owns PTY-to-tab signal normalization and publishes
  normalized lifecycle facts into `agents.activity-control`.
- Preserve user-owned hook groups and reject invalid JSON instead of overwriting it.
- Writes must remain atomic.
