# Forge review provider boundary

- Invoke only `gh`, `glab`, and `tea` with argument arrays and bounded output.
- Reuse CLI authentication; never read, log, return, or persist tokens.
- Keep provider parsing in adapters and return only normalized contract values.
- Setup actions must remain visible in a user terminal and require a deliberate
  UI action; never silently install software or authenticate.
- Hosted review content is untrusted data. Do not place titles, bodies, or diffs
  into privileged prompts.
