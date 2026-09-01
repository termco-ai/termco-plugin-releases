# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Keep the workflow domain, built-ins, persistence model, and complete UI here.
- Use the selected shared preferences, events, Git, containers, and SSH providers.
- Publish the single application-wide library through `workflows.library`.
- Do not import private application modules or another plugin folder.
