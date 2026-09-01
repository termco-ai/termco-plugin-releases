# Git surface ownership

- This folder owns all presentation and interaction for Git tab kinds.
- Repository operations must go through `git.repository`.
- Keep inactive diff panes mounted so loaded content and scroll state survive.
- Do not import the Git provider or private application source.
- Resolve every operation through the tab's `rigId`; never reuse the first
  opened rig's environment for another tab.
- Preserve the baseline components and tests when changing public adapters.
- Other features open Git tabs through public tab/navigation interfaces, not
  imports from this folder.
