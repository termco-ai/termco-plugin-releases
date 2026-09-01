import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";

const element = (id: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${id}"]`);

export function createAgentsOnboardingContribution(
  view: UiAgentsViewCapability,
): OnboardingContribution {
  const reveal = () => view.show();
  return {
    id: "agents-guidance",
    targets: [
      domOnboardingTarget({
        id: "agents-manager.overview",
        label: "Agents manager",
        reveal,
        element: () => element("agents-manager.overview"),
      }),
      domOnboardingTarget({
        id: "agents-manager.navigation",
        label: "Agents library section",
        reveal,
        element: () => element("agents-manager.section.agents"),
      }),
      domOnboardingTarget({
        id: "agents-manager.agent-card",
        label: "Agent definition",
        reveal,
        element: () => element("agents-manager.agent-card"),
      }),
      domOnboardingTarget({
        id: "agents-manager.new-agent",
        label: "Create agent",
        reveal,
        element: () => element("agents-manager.new-agent"),
      }),
    ],
    journeys: [{
      id: "agents-manager-native.choose-and-create",
      title: "Choose and create AI agents",
      description: "See how agents, snippets, skills, MCP servers, models, and tool permissions shape each AI request.",
      order: 30,
      estimatedMinutes: 4,
      presentation: "contextual",
      steps: [
        {
          id: "overview",
          version: 1,
          kind: "tour",
          title: "Your reusable AI library",
          scope: { kind: "user" },
          targetId: "agents-manager.overview",
          body: {
            markdown: "This is the shared library behind Chat. Agents define working behavior, snippets provide reusable context, skills teach repeatable procedures, and MCP servers connect external tools.",
          },
        },
        {
          id: "sections",
          version: 2,
          kind: "interaction",
          title: "Open the Agents library",
          scope: { kind: "user" },
          targetId: "agents-manager.navigation",
          expectation: { kind: "click" },
          body: {
            markdown: "Open Agents to inspect the working roles available to Chat. Snippets, skills, and MCP servers remain independent library objects that a company can package while developers add personal variants.",
          },
        },
        {
          id: "activate-agent",
          version: 1,
          kind: "interaction",
          title: "Select an agent for Chat",
          scope: { kind: "user" },
          targetId: "agents-manager.agent-card",
          expectation: { kind: "click" },
          body: {
            markdown: "Select an agent card to make it active. Each card shows its model preference and tool groups, so the user can understand the capabilities granted before starting a request.",
          },
        },
        {
          id: "create",
          version: 1,
          kind: "tour",
          title: "Create a role for your workflow",
          scope: { kind: "user" },
          targetId: "agents-manager.new-agent",
          placement: "top",
          body: {
            markdown: "Create an agent when a workflow needs durable instructions or a narrower tool set. The editor lets you name the role, select a model, define instructions, and explicitly choose tool groups.",
          },
        },
      ],
    }],
  };
}
