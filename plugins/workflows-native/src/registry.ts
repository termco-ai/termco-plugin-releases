import type {
  WorkflowDefinitionsContribution,
  WorkflowDefinitionsRegistry,
  WorkflowParameterSourceContribution,
  WorkflowParameterSourceRegistry,
  WorkflowRunnerContribution,
  WorkflowRunnerRegistry,
} from "@termco/workflows-base";

function createRegistry<T extends { id: string }>() {
  const listeners = new Set<() => void>();
  const ranks = new Map<string, number>();
  let nextRank = 0;
  let entries: readonly T[] = [];
  const publish = (next: readonly T[]) => {
    entries = next;
    for (const listener of listeners) listener();
  };
  return {
    register(entry: T) {
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`registry entry "${entry.id}" is already registered`);
      }
      if (!ranks.has(entry.id)) ranks.set(entry.id, nextRank++);
      publish(
        [...entries, entry].sort(
          (left, right) =>
            (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0),
        ),
      );
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        publish(entries.filter((candidate) => candidate !== entry));
      };
    },
    snapshot: () => entries,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createWorkflowDefinitionsRegistry(): WorkflowDefinitionsRegistry {
  return createRegistry<WorkflowDefinitionsContribution>();
}

export function createWorkflowRunnerRegistry(): WorkflowRunnerRegistry {
  const registry = createRegistry<WorkflowRunnerContribution>();
  return {
    ...registry,
    resolve(target) {
      return registry.snapshot().find(
        (entry) =>
          entry.targetKinds.includes(target.kind) && entry.available(target),
      );
    },
  };
}

export function createWorkflowParameterSourceRegistry(): WorkflowParameterSourceRegistry {
  const registry = createRegistry<WorkflowParameterSourceContribution>();
  return {
    ...registry,
    resolve(source) {
      return registry.snapshot().find((entry) => entry.sources.includes(source));
    },
  };
}
