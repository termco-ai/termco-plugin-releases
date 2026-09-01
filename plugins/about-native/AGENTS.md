# Plugin boundary

- Own the exact About section and its update actions here; the updater plugin
  owns the shared workflow and update dialog.
- Obtain identity, updates, and desktop actions only through declared capabilities.
- Do not import application source or the preload bridge.
- Keep company branding replaceable by copying the whole plugin.
