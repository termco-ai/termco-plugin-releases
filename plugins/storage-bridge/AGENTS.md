# Storage bridge ownership

- This package owns renderer projections for storage-family services.
- Import public contracts only from `@termco/storage-base`.
- Keep service names, event names, subscription cleanup, and error behavior in
  this package rather than the generic renderer or Electron host.
- Every added projection needs a focused behavior test.
