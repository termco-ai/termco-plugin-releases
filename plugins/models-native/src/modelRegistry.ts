import type {
  AiModelProviderCapability,
  AiModelRegistry,
} from "@termco/ai-models-base";

export function createModelRegistry(): AiModelRegistry {
  const ranks = new Map<string, number>();
  const listeners = new Set<() => void>();
  let entries: readonly AiModelProviderCapability[] = [];
  let nextRank = 0;
  const publish = () => {
    for (const listener of listeners) listener();
  };

  return {
    register(entry) {
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`registry entry "${entry.id}" is already registered`);
      }
      if (!ranks.has(entry.id)) {
        ranks.set(entry.id, nextRank);
        nextRank += 1;
      }
      entries = [...entries, entry].sort(
        (left, right) =>
          (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0),
      );
      publish();
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        if (!entries.includes(entry)) return;
        entries = entries.filter((candidate) => candidate !== entry);
        publish();
      };
    },
    snapshot: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
