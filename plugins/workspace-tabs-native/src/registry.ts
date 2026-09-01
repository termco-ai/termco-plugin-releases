import type {
  WorkspaceTabCloseGuardContribution,
  WorkspaceTabCloseGuardRegistry,
} from "@termco/workspace-base";

export function createWorkspaceTabCloseGuardRegistry(): WorkspaceTabCloseGuardRegistry {
  const ranks = new Map<string, number>();
  let nextRank = 0;
  let entries: readonly WorkspaceTabCloseGuardContribution[] = [];

  return {
    register(entry) {
      if (entries.some((candidate) => candidate.id === entry.id)) {
        throw new Error(`registry entry "${entry.id}" is already registered`);
      }
      for (const kind of entry.kinds) {
        if (entries.some((candidate) => candidate.kinds.includes(kind))) {
          throw new Error(`Duplicate workspace tab close guard for "${kind}"`);
        }
      }
      if (!ranks.has(entry.id)) {
        ranks.set(entry.id, nextRank);
        nextRank += 1;
      }
      entries = [...entries, entry].sort(
        (left, right) =>
          (ranks.get(left.id) ?? 0) - (ranks.get(right.id) ?? 0),
      );
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        entries = entries.filter((candidate) => candidate !== entry);
      };
    },
    snapshot: () => entries,
  };
}
