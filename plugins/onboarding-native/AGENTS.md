# Plugin boundary

- Own onboarding contribution registration, validation, progress derivation, and persistence here.
- Keep product copy, visual presentation, and feature-specific targets outside this plugin.
- Never execute checks or actions during registration or idle time.
- Dispose subscriptions and generation-owned state through the plugin lifecycle.
