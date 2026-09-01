# Plugin boundary

This plugin owns managed coding-agent orchestration and private review state.

- Consume shared terminal, activity, hook, AI-session, and AI-live providers
  through contracts from their owning `@termco/*-base` packages.
- Import lifecycle APIs from `@termco/kernel`; `termco-plugin.json` is the dependency source of truth.
- Keep PTY connections and chat transcripts in their selected providers.
- Dispose activity/session subscriptions, AI-live contributions, timers, and
  private state on every replacement.
- Run all `src/*.test.ts` files after changing spawn or review behavior;
  completion requires the copied plugin to reuse the selected shared runtimes.
