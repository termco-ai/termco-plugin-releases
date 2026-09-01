# Company statusbar ownership

- This plugin owns its complete root statusbar presentation.
- Preserve the public left/right extension slots when changing the root.
- Consume shared state through contracts from the owning `@termco/*-base` package; `termco-plugin.json` is the dependency source of truth.
- Keep UI behavior, styles, assets, and tests inside this folder.
