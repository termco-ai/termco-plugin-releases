# AI Tools: Plugin Development

This plugin gives AI the same profile-owned source workflow as the Plugin
Manager: search the self-describing catalog, copy a complete plugin into an
editable replacement, inspect or edit files inside that folder, and activate
the edited generation without restarting the application.

The kernel owns path jailing, compilation, graph validation, permission checks,
destructive-resource warnings, transaction commit, and rollback. This plugin
owns only the AI workflow and can itself be copied and replaced.
