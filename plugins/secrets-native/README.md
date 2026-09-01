# Native Secret Storage

Default provider for `secrets.application@1`. It uses Electron `safeStorage` to
encrypt secrets before persisting ciphertext in the application data directory;
consumers receive only the public capability.

Copy this entire folder, change its id, set `replaces` to `secrets-native`, and
select the copy in a profile to replace it. No consumer changes are required.
