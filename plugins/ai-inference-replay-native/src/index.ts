import type { AiInferenceCapability } from "@termco/ai-inference-base";
import { AI_INFERENCE_SERVICE } from "@termco/ai-inference-base";
import type { PluginModule } from "@termco/kernel";
import { createReplayInferenceAdapter } from "./replay";
import { replayScenarios } from "./scenarios";

export * from "./replay";
export * from "./fixtureWorkflow";

const plugin: PluginModule = {
  activate(context) {
    context.provide<AiInferenceCapability>(
      AI_INFERENCE_SERVICE,
      createReplayInferenceAdapter(replayScenarios),
    );
  },
};

export default plugin;
