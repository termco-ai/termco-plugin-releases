import type {
  SourceControlSectionContribution,
  SourceControlSectionRegistry,
} from "@termco/git-base";
import type { ContributionRecord } from "@termco/kernel";

export function createSourceControlSectionRegistry(): SourceControlSectionRegistry {
  let records: readonly ContributionRecord<SourceControlSectionContribution>[] = [];
  let snapshot: readonly SourceControlSectionContribution[] = [];
  const listeners = new Set<() => void>();
  const publish = (next: readonly ContributionRecord<SourceControlSectionContribution>[]) => {
    records = next;
    snapshot = records
      .map((record) => record.value)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id));
    for (const listener of listeners) listener();
  };
  return {
    register(entry, owner) {
      if (records.some((record) => record.value.id === entry.id)) {
        throw new Error(`source control section "${entry.id}" is already registered`);
      }
      const record = { ...owner, value: entry };
      publish([...records, record]);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        publish(records.filter((candidate) => candidate !== record));
      };
    },
    snapshot: () => snapshot,
    records: () => records,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
