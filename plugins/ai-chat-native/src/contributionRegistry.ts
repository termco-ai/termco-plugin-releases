import type { Dispose } from "@termco/kernel";

export interface ContributionRegistry<T extends { id: string }> {
  register(entry: T): Dispose;
  snapshot(): readonly T[];
  subscribe(listener: () => void): Dispose;
}

interface ContributionRegistryOptions<T> {
  validate?(entry: T): void;
  compare?(left: T, right: T): number;
}

export function createContributionRegistry<
  T extends { id: string },
>(options: ContributionRegistryOptions<T> = {}): ContributionRegistry<T> {
  const ranks = new Map<string, number>();
  const listeners = new Set<() => void>();
  let entries: readonly T[] = [];
  let nextRank = 0;

  const publish = () => {
    for (const listener of listeners) listener();
  };

  return {
    register(entry) {
      options.validate?.(entry);
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`registry entry "${entry.id}" is already registered`);
      }
      if (!ranks.has(entry.id)) {
        ranks.set(entry.id, nextRank);
        nextRank += 1;
      }
      entries = [...entries, entry].sort((left, right) => {
        const compared = options.compare?.(left, right) ?? 0;
        return (
          compared ||
          (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0)
        );
      });
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
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createToolContributionRegistry<
  T extends { id: string; group: string; order?: number },
>(): ContributionRegistry<T> {
  return createContributionRegistry<T>({
    validate(entry) {
      if (!entry.group) {
        throw new Error(
          `tools.register("${entry.id}"): group is required`,
        );
      }
    },
    compare: (left, right) => (left.order ?? 0) - (right.order ?? 0),
  });
}
