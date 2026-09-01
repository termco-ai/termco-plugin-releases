import type { AiSpeechCapability } from "@termco/ai-inference-base";
import type { AiModelRegistry } from "@termco/ai-models-base";
import type { HttpCapability } from "@termco/http-base";
import type { PluginModule } from "@termco/kernel";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { createSpeechCapability } from "./speech";
import { AI_MODELS_SERVICE } from "@termco/ai-models-base";
import { NETWORK_HTTP_SERVICE } from "@termco/http-base";
import {
  SECRETS_APPLICATION_SERVICE,
  SETTINGS_PREFERENCES_SERVICE,
} from "@termco/storage-base";

const plugin: PluginModule = {
  inject: [
    AI_MODELS_SERVICE,
    SETTINGS_PREFERENCES_SERVICE,
    SECRETS_APPLICATION_SERVICE,
    NETWORK_HTTP_SERVICE,
  ],
  activate(context) {
    context.provide<AiSpeechCapability>(
      "ai.speech",
      createSpeechCapability({
        models: context.get<AiModelRegistry>("ai.models").snapshot(),
        preferences: context.get<PreferencesCapability>("settings.preferences"),
        secrets: context.get<SecretsCapability>("secrets.application"),
        http: context.get<HttpCapability>("network.http"),
      }),
    );
  },
};

export default plugin;
