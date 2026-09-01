import type { AiModelProviderCapability } from "@termco/ai-models-base";

export type ModelOption = { id: string; label: string };
export const MODELS: ModelOption[] = [];

export function configureModels(
  providers: readonly AiModelProviderCapability[],
): () => void {
  const previous = [...MODELS];
  const configured = providers.flatMap((provider) =>
    provider.models.map((model) => ({ id: model.id, label: model.label })),
  );
  MODELS.splice(
    0,
    MODELS.length,
    ...configured,
  );
  return () => {
    if (
      MODELS.length === configured.length &&
      MODELS.every(
        (model, index) =>
          model.id === configured[index]?.id &&
          model.label === configured[index]?.label,
      )
    ) {
      MODELS.splice(0, MODELS.length, ...previous);
    }
  };
}
