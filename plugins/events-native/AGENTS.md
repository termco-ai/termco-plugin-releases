# Event provider ownership

- This folder owns the complete default `events.application` implementation.
- Keep it independent from application windows and transport code.
- Consumers must use the public capability; never import this source folder.
- Preserve snapshot listener semantics: subscription changes during an emit
  affect the next emit, not the one currently being delivered.
