# AI tool runtime ownership

- Own the stable `ai.tools`, `ai.toolsets`, and exclusive `ai.tool-execution` identities.
- Keep contribution ordering, collision handling, observation, and disposal here.
- Keep schema validation, approval resolution, durable call/result ordering, tool body execution, structured errors, timing, and model-visible output behind the `ai.tool-execution` interface.
- Never import Chat presentation, provider SDKs, or another plugin's source.
