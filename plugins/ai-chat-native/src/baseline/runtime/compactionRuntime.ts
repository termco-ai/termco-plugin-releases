import type { AiInferenceCapability } from "@termco/ai-inference-base";

let inference: AiInferenceCapability | null = null;

export function aiCompactionRuntimeActive(): boolean {
  return inference !== null;
}

export function configureCompactionRuntime(
  selected: AiInferenceCapability,
): () => void {
  inference = selected;
  return () => {
    if (inference === selected) inference = null;
  };
}

export function compactionInference(): AiInferenceCapability {
  if (!inference) throw new Error("AI inference provider is not active");
  return inference;
}
