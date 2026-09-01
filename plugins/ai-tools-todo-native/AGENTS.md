# Plugin boundary

- Own the `todo_write` schema and validation here.
- Store task state only through the session runtime supplied by `ai.sessions`.
- Replace the whole list atomically; do not create a second task store.
