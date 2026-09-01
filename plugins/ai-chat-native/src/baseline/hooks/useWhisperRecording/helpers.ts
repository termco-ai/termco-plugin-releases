// Pure STT helpers for the whisper-recording hook: MediaRecorder MIME
// negotiation and per-provider API-key selection / requirement checks.
import type {
  AiSpeechProvider as SttProvider,
} from "@termco/ai-inference-base";
import type { ProviderKeys } from "../../../store/types";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export function providerNeedsKey(provider: SttProvider): boolean {
  return provider !== "whispercpp";
}

export function getApiKeyForStt(
  apiKeys: ProviderKeys,
  provider: SttProvider,
): string | null {
  if (provider === "openai") return apiKeys.openai;
  if (provider === "groq") return apiKeys.groq;
  return null;
}
