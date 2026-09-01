# Plugin boundary

This plugin owns application-wide compound tab workflows.

- Consume only public tab, terminal-session, and close-guard capabilities.
- Never import header, explorer, shell, host application, or another plugin's
  private source.
- Preserve exact guard wording and transition behavior contributed by each tab
  kind.
