# Command Palette State

This source-owning provider supplies the single application-wide
`ui.command-palette` state. Header and command-palette surface plugins consume
the capability without importing each other or creating duplicate open, mode,
query, anchor, or input-slot state.

Copy this directory and select the copy in a profile to replace the state
provider implementation.
