# Plugin boundary

- Import lifecycle types from `@termco/kernel` and terminal, composer, and
  workspace contracts and constants from their owning `@termco/*-base`
  packages.
- Own only the integration that contributes the combined workspace footer.
- Never import another plugin directory or application-private source.
