import type {
  AiToolContribution,
  AiToolRegistry,
  AiToolsetContribution,
  AiToolsetRegistry,
} from "@termco/ai-tools-base";

function createRegistry<T extends { id: string; group: string; order?: number }>() {
  const ranks = new Map<string, number>();
  const listeners = new Set<() => void>();
  let entries: readonly T[] = [];
  let nextRank = 0;

  const publish = () => {
    for (const listener of listeners) listener();
  };

  return {
    register(entry: T) {
      if (!entry.group) {
        throw new Error(`tools.register("${entry.id}"): group is required`);
      }
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`registry entry "${entry.id}" is already registered`);
      }
      if (!ranks.has(entry.id)) ranks.set(entry.id, nextRank++);
      entries = [...entries, entry].sort(
        (left, right) =>
          (left.order ?? 0) - (right.order ?? 0) ||
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
    snapshot: () => [...entries],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createAiRegistries(): {
  tools: AiToolRegistry;
  toolsets: AiToolsetRegistry;
} {
  return {
    tools: createRegistry<AiToolContribution>(),
    toolsets: createRegistry<AiToolsetContribution>(),
  };
}
