# Plugin boundary

This plugin owns application-wide workspace tab state.

- Never import Termco application source or another plugin.
- Tab-kind payloads are opaque; feature plugins own their interpretation.
- Keep identity allocation, active/split invariants, cold activation, and
  publication behind the `workspace.tabs` capability.
- Do not add UI to this provider.
