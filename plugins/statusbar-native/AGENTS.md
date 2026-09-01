# Status bar ownership

- This folder owns all default status-bar product UI and workflows.
- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Keep the complete footer under this plugin's single keyed root contribution;
  internal items stay as local components so forks can edit or remove them.
- Never import private application modules or another plugin's source.
