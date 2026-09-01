# Session Query

Current-format semantic query provider for human trajectory inspection. It
indexes and explains canonical session events through `session.history`; it
does not own session persistence or interpret any other format.

It also provides the separate `session.query.model` capability. That seam
derives scope from the caller session, redacts model output, excludes the
currently executing step, and enforces fixed scan/result/output budgets. No
model receives the human provider's cursors, limits, workspace identity, or
raw events.
