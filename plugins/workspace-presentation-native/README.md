# Workspace Presentation Native

The default replaceable provider for the selected workspace's shared header
and sidebar read model. It owns one revisioned snapshot; the workspace shell
publishes through `workspace.presentation-control`, while independent UI
plugins subscribe through read-only `workspace.presentation`.
