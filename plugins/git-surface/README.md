# Git Surfaces

This source-owning plugin contains the complete preserved Git tab product:
CodeMirror working-tree and commit-file diffs, cache/invalidation behavior,
binary and large-file fallbacks, virtualized paginated history, commit graph,
header-driven search, commit details, remote links, and changed-file drilldown.

The `src/baseline` tree contains the pre-migration implementation and tests.
Adapters around it consume the selected application-wide `git.repository`,
theme, file-icon, desktop, and tab interfaces without importing private host
source. Copy this directory to replace the actual feature while retaining the
shared Git provider and its connection/runtime state.
