import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OnboardingRuntime, OnboardingSnapshot } from "@termco/onboarding-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import { AutomaticOffer, Content, OnboardingSettings } from "./index";

function runtime(snapshot: OnboardingSnapshot): OnboardingRuntime {
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    setContext: vi.fn(),
    suggest: vi.fn(async () => true),
    start: vi.fn(async () => {}),
    dismissOffer: vi.fn(async () => {}),
    next: vi.fn(async () => {}),
    back: vi.fn(),
    skip: vi.fn(async () => {}),
    close: vi.fn(),
    completeCurrent: vi.fn(async () => {}),
    retryCheck: vi.fn(async () => {}),
    prepareAction: vi.fn(async () => {}),
    runPreparedAction: vi.fn(async () => {}),
    resetJourney: vi.fn(async () => {}),
    resetAll: vi.fn(async () => {}),
    target: vi.fn(),
  };
}

function settings(open = false): UiSettingsViewCapability {
  const snapshot = { revision: 0, open, requestedSection: null, openSequence: 0 };
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    show: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  };
}

describe("Onboarding Settings", () => {
  it("renders instructional emphasis and inline code instead of raw Markdown", () => {
    const view = render(<Content content={{ markdown: "Choose **Codex** and enter `fix tests`." }} />);
    expect(view.container.querySelector('[data-streamdown="strong"]')).toHaveTextContent("Codex");
    expect(view.container.querySelector("code")).toHaveTextContent("fix tests");
    expect(view.container).not.toHaveTextContent("**Codex**");
  });

  it("shows contributed journeys and starts the selected real journey", () => {
    const api = runtime({
    revision: 1,
    active: null,
    offer: null,
      journeys: [{
        id: "company.setup",
        title: "Company setup",
        description: "Learn the company profile.",
        presentation: "available",
        owner: { pluginId: "company", generation: "g1", key: "setup" },
        completedSteps: 0,
        totalSteps: 1,
        complete: false,
        steps: [{
          id: "intro",
          title: "Introduction",
          optional: false,
          status: "available",
          step: {
            id: "intro",
            version: 1,
            kind: "information",
            title: "Introduction",
            scope: { kind: "user" },
            body: { markdown: "Welcome" },
          },
        }],
      }],
    });
    render(<OnboardingSettings runtime={api} />);
    expect(screen.getByText("Company setup")).toBeVisible();
    expect(screen.getByText("0/1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(api.start).toHaveBeenCalledWith("company.setup");
  });

  it("explains the empty state when no active plugin contributes onboarding", () => {
    render(<OnboardingSettings runtime={runtime({ revision: 0, active: null, journeys: [], offer: null })} />);
    expect(screen.getByText("No onboarding journeys are active")).toBeVisible();
  });

  it("offers an automatic tour without blocking the workspace", () => {
    const api = runtime({
      revision: 1,
      active: null,
      journeys: [],
      offer: {
        journeyId: "termco.first-workspace",
        title: "Build your first workspace",
        description: "A practical tour.",
        presentation: "automatic",
      },
    });
    render(<AutomaticOffer runtime={api} settings={settings()} />);
    expect(screen.getByTestId("onboarding-offer")).toHaveTextContent("Your profile is ready");
    fireEvent.click(screen.getByRole("button", { name: "Take guided tour" }));
    expect(api.start).toHaveBeenCalledWith("termco.first-workspace");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(api.dismissOffer).toHaveBeenCalledOnce();
  });

  it("labels feature-owned contextual guidance at the point of use", () => {
    const api = runtime({
      revision: 1,
      active: null,
      journeys: [],
      offer: {
        journeyId: "containers-native.manage-runtime",
        title: "Manage containers on any rig",
        description: "Inspect this feature.",
        presentation: "contextual",
      },
    });
    const view = render(<AutomaticOffer runtime={api} settings={settings()} />);
    expect(within(view.container).getByTestId("onboarding-offer")).toHaveTextContent(
      "Learn this feature",
    );
  });

  it("does not cover settings while the automatic tour is still available", () => {
    const api = runtime({
      revision: 1,
      active: null,
      journeys: [],
      offer: { journeyId: "termco.first-workspace", title: "First workspace", description: "Tour", presentation: "automatic" },
    });
    const view = render(<AutomaticOffer runtime={api} settings={settings(true)} />);
    expect(view.container.querySelector('[data-testid="onboarding-offer"]')).toBeNull();
  });
});
