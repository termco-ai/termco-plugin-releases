/**
 * Custom OpenAI-compatible endpoints: the user-defined `compat-*` model ids,
 * and the pseudo-`ModelInfo` synthesised for them.
 *
 * Extracted from the former monolithic `ai/config.ts`.
 */

import type { ModelInfo } from "./models";

/** A user-configured OpenAI-compatible endpoint (base URL + model + window). */
export type CustomEndpoint = {
  id: string;
  name: string;
  baseURL: string;
  modelId: string;
  contextLimit: number;
};

/** Prefix that marks a model id as pointing at a custom endpoint. */
const COMPAT_MODEL_PREFIX = "compat-";

/** Build the synthetic model id that routes to the given endpoint. */
export function compatModelIdForEndpoint(endpointId: string): string {
  return `${COMPAT_MODEL_PREFIX}${endpointId}`;
}

/** True when a model id refers to a custom OpenAI-compatible endpoint. */
export function isCompatModelId(modelId: string): boolean {
  return modelId.startsWith(COMPAT_MODEL_PREFIX);
}

/** Recover the endpoint id embedded in a `compat-*` model id (else ""). */
export function endpointIdFromCompatModel(modelId: string): string {
  return isCompatModelId(modelId)
    ? modelId.slice(COMPAT_MODEL_PREFIX.length)
    : "";
}

/** Synthesise a `ModelInfo` for a custom-endpoint model id so the rest of the
 *  UI can treat it like any registered model. */
export function getCompatModelInfo(
  modelId: string,
  endpoints: readonly CustomEndpoint[],
): ModelInfo {
  const eid = endpointIdFromCompatModel(modelId);
  const ep = endpoints.find((e) => e.id === eid);
  const name = ep?.name || "Custom endpoint";
  return {
    id: modelId,
    provider: "openai-compatible",
    label: ep?.modelId || name,
    hint: name,
    description: ep
      ? `${name} — ${ep.baseURL}`
      : "Custom OpenAI-compatible endpoint",
    capabilities: { intelligence: 3, speed: 3, cost: 3 },
  };
}
