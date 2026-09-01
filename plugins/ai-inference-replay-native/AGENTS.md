# Deterministic inference replay ownership

- Consume only current canonical session headers and events from `@termco/session-base`.
- Implement the selected `ai.inference` capability without network access, credentials, or model SDKs.
- Keep fixtures strict: no importers, aliases, fallback readers, mixed representations, or format conversion.
- Fail closed on semantic request drift, missing scripts, extra calls, and incomplete consumption.
- Keep this provider absent from shipped profiles; deterministic test profiles opt into it explicitly.

