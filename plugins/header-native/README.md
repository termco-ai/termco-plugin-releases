# Default Application Header

This source-owning plugin contains every visible default header control and its
interaction workflow. It contributes navigation, workspace tabs, inline
command/find search, trailing actions/activity, and the open-tab strip through
keyed `ui.header.items` entries.

It also provides `workspace.rigs-overview`, owning the open/close state of its
complete rig manager. Commands and shortcuts request that public capability;
the host does not retain a second UI store.

The plugin owns all tab chrome as one replacement unit: the strip, menus,
icons, drag-to-split feedback, MRU keyboard workflow, and switcher HUD. Its
exact icon renderer is exposed as `ui.tabs.presentation` so generic split-pane
chrome reuses it without importing or copying header source. Live replacement
updates both locations together.

Copy this folder and replace `header-native` to remove an icon, add a control,
change the workspace or tab workflow, or replace the entire header without
editing the application shell. It consumes the shared shortcut, SSH, and agent
hook providers; it does not create private copies of those runtimes.
