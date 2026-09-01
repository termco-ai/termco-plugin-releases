# Desktop Integration

The complete default implementation of `desktop.integration`,
`desktop.window-control`, and `desktop.window`. The main entrypoint owns native
Electron window targeting; the renderer entrypoint owns close-request and
window-event semantics. Copy this folder to replace operating-system and
current-window integration without editing the platform.
