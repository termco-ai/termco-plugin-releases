import { describe, expect, it, vi } from "vitest";
import type { OnboardingContribution } from "@termco/onboarding-base";
import type { PreferencesCapability, PreferenceChangeListener } from "@termco/storage-base";
import { createOnboardingRegistry } from "./registry";
import { createOnboardingRuntime } from "./runtime";

function preferences(initial?: unknown): PreferencesCapability & { value(): unknown } {
  const stored = new Map<string, unknown>(initial === undefined ? [] : [["onboarding.progress.v1", initial]]);
  const listeners = new Set<PreferenceChangeListener>();
  return {
    get: vi.fn(async (key) => stored.get(key) as never),
    getMany: vi.fn(async () => ({})),
    set: vi.fn(async (key, value) => {
      stored.set(key, value);
      for (const listener of listeners) listener(key, value);
    }),
    delete: vi.fn(async (key) => stored.delete(key)),
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    value: () => stored.get("onboarding.progress.v1"),
  };
}

function contribution(stepVersion = 1): OnboardingContribution {
  return {
    id: "core",
    journeys: [{
      id: "core.start",
      title: "Start",
      description: "Start here.",
      presentation: "automatic",
      steps: [
        {
          id: "intro",
          version: stepVersion,
          kind: "information",
          title: "Introduction",
          scope: { kind: "user" },
          body: { markdown: "Welcome" },
        },
        {
          id: "choose",
          version: 1,
          kind: "interaction",
          title: "Choose",
          scope: { kind: "user" },
          targetId: "core.target",
          expectation: { kind: "click" },
          body: { markdown: "Choose it" },
        },
      ],
    }],
    targets: [{
      id: "core.target",
      label: "Core target",
      reveal: vi.fn(),
    }],
  };
}

const owner = {
  pluginId: "onboarding-content",
  generation: "generation-1",
  key: "core",
};

describe("onboarding runtime", () => {
  it("offers automatic onboarding without blocking and remembers Not now", async () => {
    const store = preferences();
    const registry = createOnboardingRegistry();
    registry.register(contribution(), owner);
    const runtime = await createOnboardingRuntime(registry, store);

    expect(runtime.snapshot().offer?.journeyId).toBe("core.start");
    expect(runtime.snapshot().active).toBeNull();
    await runtime.dismissOffer();
    expect(runtime.snapshot().offer).toBeNull();
    expect(store.set).toHaveBeenCalledWith(
      "onboarding.dismissals.v1",
      expect.objectContaining({ "onboarding-content/core.start/user": true }),
    );
    runtime.dispose();
  });

  it("offers plugin-owned contextual journeys only when suggested and respects dismissal", async () => {
    const store = preferences();
    const registry = createOnboardingRegistry();
    const contextual = contribution();
    contextual.journeys = contextual.journeys?.map((journey) => ({
      ...journey,
      id: "core.contextual",
      presentation: "contextual" as const,
    }));
    registry.register(contextual, owner);
    const runtime = await createOnboardingRuntime(registry, store);

    expect(runtime.snapshot().offer).toBeNull();
    await expect(runtime.suggest("core.contextual")).resolves.toBe(true);
    expect(runtime.snapshot().offer?.journeyId).toBe("core.contextual");
    await runtime.dismissOffer();
    expect(runtime.snapshot().offer).toBeNull();
    await expect(runtime.suggest("core.contextual")).resolves.toBe(false);
    runtime.dispose();
  });

  it("withdraws a contextual offer when its owning plugin unloads", async () => {
    const registry = createOnboardingRegistry();
    const contextual = contribution();
    contextual.journeys = contextual.journeys?.map((journey) => ({
      ...journey,
      id: "core.contextual",
      presentation: "contextual" as const,
    }));
    const disposeContribution = registry.register(contextual, owner);
    const runtime = await createOnboardingRuntime(registry, preferences());

    await runtime.suggest("core.contextual");
    disposeContribution();
    expect(runtime.snapshot().offer).toBeNull();
    runtime.dispose();
  });

  it("persists completion, resumes at the next step, and keeps progress across contribution disposal", async () => {
    const store = preferences();
    const registry = createOnboardingRegistry();
    const disposeContribution = registry.register(contribution(), owner);
    const runtime = await createOnboardingRuntime(registry, store);

    await runtime.start("core.start");
    await runtime.next();
    expect(runtime.snapshot().active?.stepId).toBe("choose");
    expect(runtime.snapshot().journeys[0]?.completedSteps).toBe(1);

    disposeContribution();
    expect(runtime.snapshot().journeys).toEqual([]);
    expect(runtime.snapshot().active).toBeNull();
    registry.register(contribution(), { ...owner, generation: "generation-2" });
    expect(runtime.snapshot().journeys[0]?.completedSteps).toBe(1);
    await runtime.start("core.start");
    expect(runtime.snapshot().active?.stepId).toBe("choose");
    runtime.dispose();
  });

  it("invalidates only a step whose version changes", async () => {
    const store = preferences();
    const firstRegistry = createOnboardingRegistry();
    firstRegistry.register(contribution(), owner);
    const first = await createOnboardingRuntime(firstRegistry, store);
    await first.start("core.start");
    await first.next();
    await first.completeCurrent();
    expect(first.snapshot().journeys[0]?.complete).toBe(true);
    first.dispose();

    const nextRegistry = createOnboardingRegistry();
    nextRegistry.register(contribution(2), owner);
    const next = await createOnboardingRuntime(nextRegistry, store);
    expect(next.snapshot().journeys[0]?.steps.map((step) => step.status)).toEqual([
      "available",
      "complete",
    ]);
    next.dispose();
  });

  it("runs checks only on explicit retry and requires action preview before execution", async () => {
    const check = vi.fn(async () => ({ satisfied: true, summary: "Ready" }));
    const prepare = vi.fn(async () => ({
      token: "token-1",
      title: "Apply",
      explanation: "Apply configuration.",
      operation: "termco apply",
      location: "local machine",
    }));
    const run = vi.fn(async () => ({ ok: true, summary: "Applied" }));
    const registry = createOnboardingRegistry();
    registry.register({
      id: "reviewed",
      journeys: [{
        id: "reviewed.setup",
        title: "Reviewed setup",
        description: "Check and act.",
        steps: [
          { id: "check", version: 1, kind: "check", title: "Check", scope: { kind: "user" }, body: { markdown: "Check" }, check },
          { id: "action", version: 1, kind: "action", title: "Apply", scope: { kind: "user" }, body: { markdown: "Apply" }, prepare, run },
        ],
      }],
    }, owner);
    const runtime = await createOnboardingRuntime(registry, preferences());
    expect(check).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    await runtime.start("reviewed.setup");
    await runtime.retryCheck();
    expect(check).toHaveBeenCalledOnce();
    expect(runtime.snapshot().active?.stepId).toBe("action");
    expect(run).not.toHaveBeenCalled();
    await runtime.prepareAction();
    expect(runtime.snapshot().active?.actionPreview?.token).toBe("token-1");
    expect(run).not.toHaveBeenCalled();
    await runtime.runPreparedAction();
    expect(run).toHaveBeenCalledWith({}, { token: "token-1" });
    expect(runtime.snapshot().active).toBeNull();
    runtime.dispose();
  });
});
