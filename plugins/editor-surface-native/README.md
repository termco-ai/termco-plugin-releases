# Editor Surface

Owns the complete editable editor feature: tabs, CodeMirror configuration,
languages, LSP presentation, inline completion, formatting, file watching,
binary previews, and new-file workflow. Native file, LSP, preference, theme,
event, and inference state is consumed through selected capabilities.
The plugin provides `editor.sessions` for live pane operations and
`editor.navigation` for external new-file requests from the header and global
shortcuts; consumers never import its dialog state or components.

Copy this entire folder, change its id/name, keep `replaces` pointed at
`editor-surface`, and select the copy in a profile to replace the editor live.
