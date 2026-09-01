# Workspace Tabs Native

The default source-owning provider for `workspace.tabs`. It owns one shared tab
state machine, including active/split selection and which split pane owns
focus, while terminal, editor, browser, Git, Markdown, and third-party surface
plugins own the payload and presentation of their tab kinds. Saved
per-rig layouts are persisted through the selected `settings.preferences`
provider; the rig provider owns only rig metadata and selection.

Replacing this provider is destructive to open tabs and therefore uses the
platform replacement warning flow.
