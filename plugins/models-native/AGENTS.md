# Models provider boundary

- This plugin owns model/provider facts and pure model-ID rules.
- It must not own settings UI, secrets, chat sessions, or network clients.
- Every registry key declared in the manifest must be provided during activation.
- Preserve keychain account names and persisted model IDs unless a migration is intentional.
