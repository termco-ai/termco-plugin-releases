# JSON Application Storage

Default provider for `storage.application@1`. One provider owns shared in-memory
stores and serializes atomic writes under Electron's user-data directory.

Consumers use the capability and never read provider files directly. A copied
plugin can replace this provider with SQLite, a company service, or another
backend without changing those consumers.
