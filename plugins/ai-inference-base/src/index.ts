export * from "./aiInference";
export * from "./aiSpeech";

export const AI_INFERENCE_SERVICE = "ai.inference" as const;
export const AI_SPEECH_SERVICE = "ai.speech" as const;

declare module "@termco/kernel" {
  interface Services {
    [AI_INFERENCE_SERVICE]: import("./aiInference").AiInferenceCapability;
    [AI_SPEECH_SERVICE]: import("./aiSpeech").AiSpeechCapability;
  }
}
