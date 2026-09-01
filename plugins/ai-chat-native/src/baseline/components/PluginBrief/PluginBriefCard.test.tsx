// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";
import { PluginBriefCard } from "./PluginBriefCard";

let disposePresentations: () => void;
beforeAll(() => { disposePresentations = installToolPresentationFixture(); });
afterAll(() => disposePresentations());
afterEach(cleanup);

const BRIEF = {
  revision: 2,
  title: "Orbit Release Gate",
  outcome: "Maya can see whether Orbit is ready to ship.",
  userJourney: "After the workflow completes, Maya opens one release decision surface.",
  experience: {
    location: "A full left-sidebar view",
    interaction: "Complete four checks and reset them when the release changes.",
    states: ["0/4 checks", "In progress", "Ready to ship"],
  },
  scope: {
    included: ["Four release checks", "Live progress"],
    excluded: ["Deploying production"],
  },
  acceptanceCriteria: ["The sidebar reaches Ready to ship after all checks."],
  onboarding: {
    decision: "include",
    rationale: "The release gate has a short first-run workflow.",
    journey: {
      id: "orbit-release-gate-getting-started",
      title: "Run your first release check",
      description: "Learn the release decision flow.",
      presentation: "contextual",
      steps: [
        { id: "open-gate", version: 1, title: "Open the release gate", kind: "interaction", instruction: "Open the gate.", targetId: "orbit-release-gate", expectation: { kind: "click" } },
        { id: "complete-check", version: 1, title: "Complete a check", kind: "information", instruction: "Complete one release check." },
      ],
    },
  },
  authoring: {
    intent: "create",
    plugin: { id: "orbit-release-gate", name: "Orbit Release Gate", description: "Release readiness.", category: "Developer workflow" },
    target: "ui.sidebar.views",
    contributions: [],
    reveal: "auto",
  },
};

function part(state: string, output?: unknown) {
  return {
    type: "tool-plugin_brief",
    toolCallId: "brief-2",
    state,
    input: BRIEF,
    output,
  } as never;
}

describe("PluginBriefCard", () => {
  it("shows the outcome, experience, scope, acceptance, and resolved seam", () => {
    render(<PluginBriefCard part={part("input-available")} onRespond={vi.fn()} />);
    expect(screen.getByText("Orbit Release Gate")).toBeInTheDocument();
    expect(screen.getByText("A full left-sidebar view")).toBeInTheDocument();
    expect(screen.getByText("Deploying production")).toBeInTheDocument();
    expect(screen.getByText("The sidebar reaches Ready to ship after all checks.")).toBeInTheDocument();
    expect(screen.getByText("Onboarding included")).toBeInTheDocument();
    expect(screen.getByText("Run your first release check")).toBeInTheDocument();
    expect(screen.getByText("Open the release gate")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Implementation details"));
    expect(screen.getByText("ui.sidebar.views")).toBeInTheDocument();
  });

  it("confirms the exact tool call", () => {
    const onRespond = vi.fn();
    render(<PluginBriefCard part={part("input-available")} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and build" }));
    expect(onRespond).toHaveBeenCalledWith("brief-2", { action: "confirm" });
  });

  it("requires a useful note before requesting a revision", () => {
    const onRespond = vi.fn();
    render(<PluginBriefCard part={part("input-available")} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Change something" }));
    const send = screen.getByRole("button", { name: /Send change/ });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What should change?"), {
      target: { value: "Show this in the workspace footer instead." },
    });
    fireEvent.click(send);
    expect(onRespond).toHaveBeenCalledWith("brief-2", {
      action: "revise",
      note: "Show this in the workspace footer instead.",
    });
  });

  it("renders a durable confirmed record", () => {
    render(<PluginBriefCard part={part("output-available", { action: "confirm" })} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm and build" })).toBeNull();
  });
});
