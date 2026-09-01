# Plugin boundary

- Keep product identity, build facts, and the distributable logo in this plugin.
- Import lifecycle interfaces from `@termco/kernel` and identity contracts from `@termco/application-base`; keep `termco-plugin.json` authoritative.
- Preserve the main-owned `application.info` and renderer-owned `application.branding` split.
- Verify both real entrypoints and the About-off identity test after ownership changes.
