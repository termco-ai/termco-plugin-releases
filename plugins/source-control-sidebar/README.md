# Source Control

This source-owning plugin contains the complete default Source Control sidebar,
including its rail icon, badge, repository polling, branch selector, staging,
discard confirmation, commit workflow, remote actions, diff opening, and error
states. Its `src/baseline` tree is the preserved pre-migration Source Control
implementation and tests. The surrounding plugin adapters connect that UI to
public application capabilities without changing its design or behavior.

The plugin consumes the one application-wide `git.repository` provider and
provides `source-control.navigation`. A fork can therefore replace the UI and
workflow without creating a second Git runtime, while other plugins can open
the selected repository's history without importing this plugin's source.

Copy this directory and replace `source-control-sidebar` to change or replace
the feature. No implementation is imported from Termco's private source tree.
