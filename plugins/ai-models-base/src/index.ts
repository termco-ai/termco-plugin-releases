export * from "./aiModels";

export const AI_MODELS_SERVICE = "ai.models" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_MODELS_SERVICE]: import("./aiModels").AiModelRegistry;
  }
}
