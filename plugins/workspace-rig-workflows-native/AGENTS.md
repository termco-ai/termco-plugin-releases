# Plugin boundary

This plugin owns cross-provider workspace-rig workflows.

- Consume only public workspace, rig, tab, and terminal capabilities.
- Never import header, command-palette, host application, or another plugin's
  source.
- Keep provider state in the selected providers; this plugin coordinates
  transitions without duplicating their stores or runtimes.
