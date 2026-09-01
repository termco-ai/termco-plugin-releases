# Plugin boundary

- Keep the stable generic icon fallback and resolver registry in this plugin.
- Import lifecycle interfaces from `@termco/kernel` and icon contracts from `@termco/files-base`; keep `termco-plugin.json` authoritative.
- Add specialized catalogues as lifecycle-owned resolvers with stable IDs and explicit priority.
- Verify resolver off/on behavior and generic fallback continuity after registry changes.
