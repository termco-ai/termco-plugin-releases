/**
 * Speech-to-text configuration: the supported transcription providers, their
 * display labels, the default choice, and the local Whisper.cpp base URL.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

/** Supported speech-to-text backends. */
export type SttProvider = "openai" | "groq" | "whispercpp";

/** Display labels for each STT provider. */
export const STT_PROVIDER_LABELS: Record<SttProvider, string> = {
  openai: "OpenAI Whisper",
  groq: "Groq Whisper",
  whispercpp: "Whisper.cpp (local)",
};

/** Default STT provider when none has been chosen. */
export const DEFAULT_STT_PROVIDER: SttProvider = "openai";

/** Default endpoint for a locally-running Whisper.cpp server. */
export const WHISPERCPP_DEFAULT_BASE_URL = "http://127.0.0.1:8080";
