# Plugin boundary

- Import lifecycle APIs from `@termco/kernel`, product contracts from their owning `@termco/*-base` packages, and controls from `@termco/ui`; `termco-plugin.json` is the dependency source of truth.
- This folder owns palette state and every visible palette element.
- Commands are consumed through `ui.commands`; never import another feature.
- File, history, theme, and shortcut behavior must use selected capabilities.
