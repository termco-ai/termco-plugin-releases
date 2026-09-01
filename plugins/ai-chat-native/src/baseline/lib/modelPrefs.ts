import type {
  AiReasoningEffort as ReasoningEffort,
} from "@termco/ai-models-base";
import {
  setFavoriteModelIds,
  setReasoningByModel,
  setRecentModelIds,
  usePreferencesStore,
} from "../runtime/preferences";

const RECENTS_MAX = 5;

export async function toggleFavoriteModel(id: string): Promise<void> {
  const current = usePreferencesStore.getState().favoriteModelIds;
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  await setFavoriteModelIds(next);
}

/**
 * Set (or clear) the thinking-effort level for a single model. Reads the current
 * per-model map, updates the one entry, and persists. Passing the model's
 * default is stored verbatim; there is no special "clear" — the UI always writes
 * a concrete level the model supports.
 */
export async function setModelReasoning(
  modelId: string,
  effort: ReasoningEffort,
): Promise<void> {
  const current = usePreferencesStore.getState().reasoningByModel;
  if (current[modelId] === effort) return;
  await setReasoningByModel({ ...current, [modelId]: effort });
}

export async function pushRecentModel(id: string): Promise<void> {
  const current = usePreferencesStore.getState().recentModelIds;
  const next = [id, ...current.filter((x) => x !== id)].slice(0, RECENTS_MAX);
  if (
    next.length === current.length &&
    next.every((x, i) => x === current[i])
  ) {
    return;
  }
  await setRecentModelIds(next);
}
