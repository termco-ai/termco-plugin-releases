# Changelog

## 1.0.0

- Add a first-class Reviews mode to Source Control and open reviews in local Termco tabs.
- Show exact head/base revisions, branch direction, side-by-side file diffs, checks, and discussions.
- Support large review diffs with a dedicated 128 MB transport budget while keeping metadata bounded.
- Add local line and overall comment drafts with head-SHA validation and explicit publish confirmation.
- Add AI tools for review overview, files, checks, discussions, local drafts, and approval-gated isolated worktrees.
- Start every review handoff in a fresh chat with the built-in Code Reviewer agent and keep AI comments as user-publishable local drafts.
- Bind review chats to the merge request's exact repository and rig so every AI tool keeps using that repository even when the rig root is broader or the active terminal changes.
- Keep review tabs live-only: they close on restart instead of reopening with potentially stale merge-request state.
- Keep guided CLI installation, login, refresh, and browser fallback actions.
- Keep local drafts visible in a persistent review queue with their destination and creation time, and show line drafts directly inside the diff.
- Group existing review conversations with review outcomes and add local-first threaded replies for GitHub and GitLab.
- Separate human conversations from system history, show open-thread counts per file, and provide commented/open filters plus next-open navigation.
- Resolve and reopen GitHub and GitLab review conversations directly from the conversation list or inline diff.
- Show merge blockers, approval requirements, reviewer states, failed or pending checks, and outdated conversation locations.
- Let users edit or remove local drafts before submitting a provider-native Comment, Approve, or Request changes review.
- Let the Code Reviewer inspect readiness and create, list, update, or delete local reply drafts without silently publishing them.

- Publish only confirmed feedback, preserve pending outcomes across retries, and keep concurrently added drafts local.
- Correct increment/decrement diff numbering and renamed-file GitLab line positions.
- Strip credentials from forge repository targets and bound cached review data.
- Keep both diff columns visible with line wrapping, search review lists, and navigate each open conversation reliably.
- Preview exact destinations and comment text before publication; disable unsupported provider actions.
