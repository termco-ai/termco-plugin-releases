# Desktop provider ownership

- This folder owns open/reveal actions, process lifecycle, autostart, clipboard,
  notification, renderer log behavior, native current-window actions, and
  renderer close/focus/resize semantics.
- Keep the public capability independent of Electron types.
- Treat unknown renderer log levels as informational.
