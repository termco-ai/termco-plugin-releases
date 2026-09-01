# Models settings boundary

- Consume model/provider metadata only through `ai.models` registry entries.
- Never import application source or a provider implementation.
- Preserve preference keys, keychain service/account names, and cross-window events.
- The plugin owns the complete Models settings workflow and must remain copyable.
