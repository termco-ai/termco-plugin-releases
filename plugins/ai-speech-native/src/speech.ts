import type {
  AiSpeechCapability,
  AiSpeechProvider,
} from "@termco/ai-inference-base";
import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { toWav } from "./wav";

const KEYRING_SERVICE = "termco-ai";
const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

function loopbackUrl(value: string): string {
  const normalized = (value || "http://127.0.0.1:8080").replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`Invalid Whisper.cpp URL: ${normalized}`);
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!(host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host))) {
    throw new Error(
      "Whisper.cpp must run on a loopback address (localhost or 127.x.x.x) to keep transcription local.",
    );
  }
  return normalized;
}

async function multipart(input: {
  audio: Blob;
  filename: string;
  model?: string;
}): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  const form = new FormData();
  form.append("file", input.audio, input.filename);
  if (input.model) form.append("model", input.model);
  form.append("response_format", "text");
  const request = new Request("https://termco.invalid", {
    method: "POST",
    body: form,
  });
  return {
    body: new Uint8Array(await request.arrayBuffer()),
    headers: Object.fromEntries(request.headers.entries()),
  };
}

function text(body: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(body));
}

export function createSpeechCapability(dependencies: {
  models: readonly AiModelProviderCapability[];
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
  http: HttpCapability;
}): AiSpeechCapability {
  const credential = async (provider: AiSpeechProvider) => {
    const definition = dependencies.models.find((entry) => entry.id === provider);
    if (!definition?.keyringAccount) return null;
    return dependencies.secrets.get(KEYRING_SERVICE, definition.keyringAccount);
  };
  return {
    async configuration() {
      const [openai, groq] = await Promise.all([
        credential("openai"),
        credential("groq"),
      ]);
      const configuredProviders: AiSpeechProvider[] = ["whispercpp"];
      if (openai) configuredProviders.push("openai");
      if (groq) configuredProviders.push("groq");
      return { configuredProviders };
    },
    async transcribe(input) {
      let url: string;
      let audio = new Blob([input.audio.slice().buffer as ArrayBuffer], {
        type: input.mimeType || "audio/webm",
      });
      let filename = "audio.webm";
      let model: string | undefined;
      let key: string | null = null;
      let allowPrivateNetwork = false;
      let timeoutMs = 30_000;

      if (input.provider === "openai") {
        url = OPENAI_URL;
        model = "whisper-1";
        key = await credential("openai");
        if (!key) throw new Error("OpenAI API key is not configured");
      } else if (input.provider === "groq") {
        url = GROQ_URL;
        model =
          (await dependencies.preferences.get<string>("groqSttModel")) ||
          "whisper-large-v3-turbo";
        key = await credential("groq");
        if (!key) throw new Error("Groq API key is not configured");
      } else {
        const configured =
          (await dependencies.preferences.get<string>("whispercppBaseURL")) ||
          "http://127.0.0.1:8080";
        url = `${loopbackUrl(configured)}/inference`;
        audio = await toWav(audio);
        filename = "audio.wav";
        allowPrivateNetwork = true;
        timeoutMs = 180_000;
      }

      const encoded = await multipart({ audio, filename, model });
      const response = await dependencies.http.request({
        url,
        method: "POST",
        headers: {
          ...encoded.headers,
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: encoded.body,
        allowPrivateNetwork,
        timeoutMs,
      });
      const responseText = text(response.body);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `STT request failed (${response.status}): ${responseText || "Unknown error"}`,
        );
      }
      return responseText;
    },
  };
}
