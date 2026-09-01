/**
 * Default base URLs for the local / self-hosted OpenAI-compatible servers.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

/** Default endpoint for a locally-running LM Studio server. */
export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";

/** Default endpoint for a locally-running `mlx_lm.server`. */
export const MLX_DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1";

/** Default endpoint for a locally-running Ollama server. */
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/** No implicit default for a generic OpenAI-compatible endpoint — user-set. */
export const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = "";
