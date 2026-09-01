# Company HTTP provider ownership

- Keep the complete HTTP implementation inside this folder.
- Consumers use only `network.http`; never import another provider's source.
- Preserve one application-wide provider instance and declare every privileged
  operation in `termco-plugin.json`.
- Add focused tests for policy, streaming, cleanup, and failure changes.
