import type { PluginModule } from "@termco/kernel";
import type { AiContextArtifactsCapability } from "@termco/ai-sessions-base";
import { SESSION_HISTORY_SERVICE, type SessionHistoryCapability } from "@termco/session-base";
import type { StorageCapability } from "@termco/storage-base";
import { createContextArtifacts } from "./artifacts";
import { STORAGE_APPLICATION_SERVICE } from "@termco/storage-base";

const STORE = "ai-context-artifacts.json";

const plugin: PluginModule = {
  inject: [
    STORAGE_APPLICATION_SERVICE,
    SESSION_HISTORY_SERVICE,
  ],
  async activate(context) {
    const storage = context.get<StorageCapability>("storage.application");
    const artifacts = await createContextArtifacts(
      storage,
      context.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
      STORE,
    );
    await context.effect(() => () => storage.close(STORE));
    context.provide<AiContextArtifactsCapability>(
      "ai.context-artifacts",
      artifacts,
    );
  },
};

export default plugin;
