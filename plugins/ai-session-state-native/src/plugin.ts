import { AI_SESSIONS_SERVICE } from "@termco/ai-sessions-base";
import type { PluginModule } from "@termco/kernel";
import { UI_WORKSPACE_COMPOSER_SERVICE } from "@termco/ui-workspace-base";
import { createSessionStateFacades } from "./facades";

const E2E_MARKER = "ai-session-state-v1";

const plugin: PluginModule = {
  async activate(context) {
    const state = createSessionStateFacades();
    context.provide(AI_SESSIONS_SERVICE, state.sessions);
    context.provide(UI_WORKSPACE_COMPOSER_SERVICE, state.composer);
    // Host controls are intentionally attached to the stable service objects,
    // not published as additional global capabilities.
    Object.assign(state.sessions, state.sessionHost);
    Object.assign(state.composer, state.composerHost);
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    if (host.__termco?.e2e) {
      const seam = (host.__termcoE2E ??= {});
      const marker = () => E2E_MARKER;
      seam.aiSessionStateProviderMarker = marker;
      await context.effect(() => () => {
        if (seam.aiSessionStateProviderMarker === marker) {
          delete seam.aiSessionStateProviderMarker;
        }
      });
    }
  },
};

export default plugin;
