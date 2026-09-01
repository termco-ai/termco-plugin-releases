/**
 * Cross-cutting AI constants: the OS keyring service name, the agent step cap,
 * the terminal scrollback budget, and the default model id.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 *
 * NOTE: `KEYRING_SERVICE` is the OS keychain service name — changing its value
 * orphans every stored API key. `DEFAULT_MODEL_ID` is persisted in user prefs.
 * Both are frozen string contracts; do not change their values.
 */

import type { ModelId } from "./models";

/** OS keychain service name under which all provider API keys are stored. */
export const KEYRING_SERVICE = "termco-ai";

/** Hard cap on agent tool-call steps per run before the loop is stopped. */
export const MAX_AGENT_STEPS = 24;

/**
 * Abort a stream when the provider sends no chunk for this long. A stall
 * detector, not a run cap — agent turns may legitimately run for many minutes.
 */
export const STREAM_CHUNK_TIMEOUT_MS = 90_000;

/** Number of terminal scrollback lines exposed to the agent as context. */
export const TERMINAL_BUFFER_LINES = 300;

/** Model selected by default until the user picks another. */
export const DEFAULT_MODEL_ID: ModelId = "gpt-5.4-mini";
