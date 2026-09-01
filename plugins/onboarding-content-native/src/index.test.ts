import { describe, expect, it } from "vitest";
import { createTermcoOnboardingContribution } from "./index";

describe("Termco product stories", () => {
  it("composes first value, the developer story, and company handoff", () => {
    const entry = createTermcoOnboardingContribution();
    expect(entry.journeys?.map((journey) => journey.id)).toEqual([
      "termco.first-value",
      "termco.developer-story",
      "termco.extend-and-share",
    ]);
    expect(entry.journeys?.flatMap((journey) => journey.steps).map((step) => step.title))
      .toEqual(expect.arrayContaining([
        "Connect the model you want to use",
        "Ask AI beside the code",
        "Operate the active rig's containers",
        "Supervise coding agents inside Termco",
        "Change an existing feature or create a new one",
        "Create the company profile",
      ]));
  });

  it("owns orchestration only and references feature-owned semantic targets", () => {
    const entry = createTermcoOnboardingContribution();
    expect(entry.targets).toBeUndefined();
    const targetIds = entry.journeys?.flatMap((journey) =>
      journey.steps.flatMap((step) => "targetId" in step ? [step.targetId] : []),
    );
    expect(targetIds).toEqual(expect.arrayContaining([
      "models.overview",
      "header.rig-strip",
      "ai-chat.panel",
      "agents-manager.overview",
      "workflows.panel",
      "containers.panel",
      "coding-agents.roster",
      "plugin-manager.catalog",
      "profile-manager.overview",
    ]));
  });
});
