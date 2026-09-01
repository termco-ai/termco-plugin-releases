import type {
  AiSpeechCapability,
  AiSpeechProvider,
} from "@termco/ai-inference-base";

let speech: AiSpeechCapability | null = null;

export function aiSpeechRuntimeActive(): boolean {
  return speech !== null;
}

export function configureSpeechCapability(
  capability: AiSpeechCapability,
): () => void {
  speech = capability;
  return () => {
    if (speech === capability) speech = null;
  };
}

export async function speechConfiguration() {
  if (!speech) {
    throw new Error("AI speech provider is not active");
  }
  return speech.configuration();
}

export async function transcribeAudio(
  blob: Blob,
  provider: AiSpeechProvider,
): Promise<string> {
  if (!speech) {
    throw new Error("AI speech provider is not active");
  }
  return speech.transcribe({
    provider,
    audio: new Uint8Array(await blob.arrayBuffer()),
    mimeType: blob.type || "audio/webm",
  });
}
