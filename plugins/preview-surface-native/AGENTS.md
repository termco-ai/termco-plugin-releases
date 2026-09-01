# Preview plugin boundaries

- Keep all preview UI, navigation, state mirrors, event handling, and browser-tab workflows in this folder.
- Consume `browser.automation`; never invoke private IPC or import application modules.
- Keep native browser session ownership in the selected provider.
- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Preserve native-view cleanup and visibility behavior when editing the surface.
