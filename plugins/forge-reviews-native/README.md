# Forge Reviews

Adds a prominent **Changes / Reviews** switch to Source Control for GitHub,
GitLab, and compatible Gitea/Forgejo repositories. Selecting a pull or merge
request opens a native Termco review tab rather than sending you to a browser.

The review tab keeps the source and target branch, exact head and base commits,
changed files, unified diff, checks, review decisions, and threaded discussions
together. Line comments, overall comments, and replies remain local drafts in a
visible review queue until you inspect them and confirm publication.
Termco revalidates the review head before it publishes anything.

AI integrations receive read-only tools for the overview, one changed file at
a time, checks, and discussions. The model can add local drafts but cannot
publish them. If it needs the complete source tree, an approval-gated tool
creates a detached worktree under Git's private directory and moves only that
AI session into it; your active checkout and uncommitted work are untouched.

When a CLI is missing, Termco can open the official installation guide or run a
supported package-manager command in a visible terminal after confirmation.
Authentication also runs visibly in a terminal; Termco never stores forge
tokens.

GitHub and GitLab support line comments. Gitea/Forgejo supports overall comments;
inline comments are disabled until its adapter supports native inline threads.

Supported CLIs:

- GitHub: `gh`
- GitLab: `glab`
- Gitea and Forgejo: `tea`

Local and SSH CLI discovery checks the active rig's login-shell PATH and common user-local,
Homebrew, MacPorts, Linuxbrew, Snap, Nix, asdf, mise, aqua, proto, WinGet,
Scoop, Chocolatey, and native installer locations as appropriate for the platform.
WSL uses its distribution's login-shell PATH. Remote rigs are searched inside
the rig rather than on the host. **Check again** clears both
PATH and executable caches after an install or login.

One-click terminal setup is offered when Homebrew is detected on a Unix rig,
or WinGet is detected on Windows. Otherwise the official installation guide is
the primary action. After installation, **Check again** discovers the CLI and
offers terminal sign-in if needed.

The diff defaults to **Auto**: narrow panes use a unified view and wider panes
use a split view. Users can choose **Split** or **Unified**, toggle line wrapping,
and hide the changed-file list to give the code more room. Review rows keep the
title, author, timestamp, and status on separate readable lines.

## Provider actions

GitHub supports comments, threaded replies, approvals, and change requests.
GitLab supports comments, threaded replies, and exact-head approvals. Each
confirmed comment is published explicitly; drafts created in GitLab itself are
never included. GitLab request-changes and Gitea/Forgejo inline comments or
review decisions are unavailable in this adapter. Gitea/Forgejo supports overall
comments. The UI disables unsupported actions instead of reporting false success.

After a partial submission, Termco keeps the remaining comments and the pending
summary/outcome available to retry. The confirmation previews the exact comment
snapshot; AI drafts arriving later remain local. Review caches expire after 45
seconds and retain at most 12 inspections within a bounded text budget.
