export type AiSpeechProvider = "openai" | "groq" | "whispercpp";

export interface AiSpeechConfiguration {
  configuredProviders: AiSpeechProvider[];
}

export interface AiSpeechCapability {
  configuration(): Promise<AiSpeechConfiguration>;
  transcribe(input: {
    provider: AiSpeechProvider;
    audio: Uint8Array;
    mimeType: string;
  }): Promise<string>;
}
