# Plugin boundary

- Import lifecycle types from `@termco/kernel`, service contracts and constants
  from their owning `@termco/*-base` packages, and UI primitives from
  `@termco/ui`.
- Keep discovery presentation, categories, search context, adoption workflows, and tests here.
- Consume `ai.library` and `workspace.files`; never import another plugin or private application source.
