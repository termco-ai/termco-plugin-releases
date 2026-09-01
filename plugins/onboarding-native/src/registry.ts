import type {
  OnboardingContribution,
  OnboardingRegistry,
} from "@termco/onboarding-base";
import type { ContributionRecord } from "@termco/kernel";

export function createOnboardingRegistry(): OnboardingRegistry {
  let records: readonly ContributionRecord<OnboardingContribution>[] = [];
  const listeners = new Set<() => void>();
  const publish = (next: readonly ContributionRecord<OnboardingContribution>[]) => {
    records = next;
    for (const listener of listeners) listener();
  };
  return {
    register(contribution, owner) {
      const journeyIds = new Set(records.flatMap((record) =>
        record.value.journeys?.map((journey) => journey.id) ?? []
      ));
      const targetIds = new Set(records.flatMap((record) =>
        record.value.targets?.map((target) => target.id) ?? []
      ));
      if (records.some((record) => record.value.id === contribution.id)) {
        throw new Error(`onboarding contribution "${contribution.id}" is already registered`);
      }
      for (const journey of contribution.journeys ?? []) {
        if (journeyIds.has(journey.id)) {
          throw new Error(`onboarding journey "${journey.id}" is already registered`);
        }
        if (journey.steps.length === 0) {
          throw new Error(`onboarding journey "${journey.id}" has no steps`);
        }
        const stepIds = new Set<string>();
        for (const step of journey.steps) {
          if (step.version < 1 || !Number.isInteger(step.version)) {
            throw new Error(`onboarding step "${journey.id}/${step.id}" has an invalid version`);
          }
          if (stepIds.has(step.id)) {
            throw new Error(`onboarding step "${journey.id}/${step.id}" is duplicated`);
          }
          stepIds.add(step.id);
        }
      }
      for (const target of contribution.targets ?? []) {
        if (targetIds.has(target.id)) {
          throw new Error(`onboarding target "${target.id}" is already registered`);
        }
      }
      const record = { ...owner, value: contribution };
      publish([...records, record]);
      let live = true;
      return () => {
        if (!live) return;
        live = false;
        publish(records.filter((candidate) => candidate !== record));
      };
    },
    records: () => records,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
