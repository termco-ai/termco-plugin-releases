# Session contract ownership

- Own versioned session identities, headers, event contracts, validators, pure projections, persistence/query/fork interfaces, and structured contract errors here.
- Keep this package independent from React, Electron, AI SDK providers, filesystem implementations, Chat stores, and other plugin source directories.
- Expose deep module interfaces: callers declare intent and consume immutable results; sequencing, validation, repair, and projection algorithms remain behind those interfaces.
- Add behavior through red-then-green tests at the public `@termco/session-base` interface.
- Treat unknown behavioral events as required by default; only explicitly informational events may be ignorable.
