# Plugin boundary

This plugin owns only the selected application-wide command-palette state.

- Keep the provider independent of command sources and rendered palette UI.
- Expose state and actions only through `ui.command-palette` from the public
  SDK.
- Preserve one immutable snapshot with a monotonic revision and notify after
  every effective state change.
- Run `src/state.test.ts` after changing state semantics; completion requires
  header and palette-surface consumers to observe the same provider instance.
