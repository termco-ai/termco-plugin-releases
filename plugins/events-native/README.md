# Application Event Bus

This source-owning provider implements `events.application`. Plugins emit and
subscribe to product events through the public capability instead of importing
Termco's Electron windows or renderer transport.

The provider is application-wide: replacing it swaps the complete event bus.
