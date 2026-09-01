# Session history provider ownership

- Implement only the current `session.history` contract from `@termco/session-base`.
- Never add an old-format parser, importer, conversion path, alternate data root, fallback reader, alias, or dual writer.
- Keep sequence and revision allocation inside the owner; callers append unsequenced typed events.
- Validate complete candidate history before commit and preserve parent/child references during removal.
- Keep persistence in the main process and the renderer entrypoint as a transport-only proxy.
- Add focused tests for every persistence, lifecycle, corruption, concurrency, and durability behavior.

