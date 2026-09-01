import { describe, expect, it, vi } from "vitest";
import type { OnboardingContribution } from "@termco/onboarding-base";
import { createOnboardingRegistry } from "./registry";

const owner = (generation: string) => ({
  pluginId: "feature-plugin",
  generation,
  key: "feature-onboarding",
});

function contribution(id = "feature"): OnboardingContribution {
  return {
    id,
    journeys: [{
      id: `${id}.journey`,
      title: "Feature journey",
      description: "Learn the feature.",
      steps: [{
        id: "intro",
        version: 1,
        kind: "information",
        title: "Introduction",
        scope: { kind: "user" },
        body: { markdown: "Hello" },
      }],
    }],
    targets: [{
      id: `${id}.target`,
      label: "Feature",
      reveal: vi.fn(),
    }],
  };
}

describe("onboarding registry", () => {
  it("retains ownership and disposes exactly one plugin generation", () => {
    const registry = createOnboardingRegistry();
    const notify = vi.fn();
    registry.subscribe(notify);
    const first = contribution("first");
    const second = contribution("second");
    const disposeFirst = registry.register(first, owner("generation-1"));
    registry.register(second, owner("generation-2"));

    expect(registry.records()).toEqual([
      { ...owner("generation-1"), value: first },
      { ...owner("generation-2"), value: second },
    ]);
    disposeFirst();
    expect(registry.records()).toEqual([
      { ...owner("generation-2"), value: second },
    ]);
    expect(notify).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate journey, target, contribution, step ids, and invalid versions", () => {
    const registry = createOnboardingRegistry();
    registry.register(contribution(), owner("generation-1"));
    expect(() => registry.register(contribution(), owner("generation-2")))
      .toThrow("contribution");

    const duplicateSteps = contribution("duplicate-steps");
    duplicateSteps.journeys![0]!.steps = [
      ...duplicateSteps.journeys![0]!.steps,
      duplicateSteps.journeys![0]!.steps[0]!,
    ];
    expect(() => registry.register(duplicateSteps, owner("generation-2")))
      .toThrow("duplicated");
  });
});
