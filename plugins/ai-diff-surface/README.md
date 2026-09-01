# AI Diff Review

This source-owning plugin contains the complete preserved AI file-review tab:
the CodeMirror merge viewer, language and theme support, exact line statistics,
new-file marker, pending/applied/rejected states, and accept/reject controls.

Its `src/baseline` tree contains the pre-migration implementation and tests.
The plugin consumes the selected shared AI-session and theme providers, so a
company can copy and replace this whole folder without replacing chat,
inference clients, approval state, or the editor surface.
