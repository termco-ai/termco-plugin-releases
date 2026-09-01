# Theme file workflow ownership

- This folder owns theme-file paths, serialization, save ingestion, and edit requests.
- Import lifecycle types from `@termco/kernel` and service contracts and
  constants from their owning `@termco/*-base` packages.
- Keep event cleanup complete so live replacement does not leak listeners.
