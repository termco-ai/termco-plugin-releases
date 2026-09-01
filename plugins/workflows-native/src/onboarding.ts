import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";

let panelVisible: () => void = () => {};

export function configureWorkflowOnboardingSuggestion(
  suggest: () => void,
): () => void {
  panelVisible = suggest;
  return () => {
    if (panelVisible === suggest) panelVisible = () => {};
  };
}

export function notifyWorkflowPanelVisible(): void {
  panelVisible();
}

async function openWorkflows(sessions: AiSessionsCapability): Promise<void> {
  sessions.openPanel();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>(
      '[data-onboarding-target="ai-dock.mode.workflows"]',
    );
    if (button) {
      button.click();
      return;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

export function createWorkflowsOnboardingContribution(
  sessions: AiSessionsCapability,
): OnboardingContribution {
  return {
    id: "workflows-guidance",
    targets: [
      domOnboardingTarget({
        id: "workflows.entry",
        label: "Workflows dock tab",
        reveal: () => sessions.openPanel(),
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="ai-dock.mode.workflows"]'),
      }),
      domOnboardingTarget({
        id: "workflows.panel",
        label: "Workflow library",
        reveal: () => openWorkflows(sessions),
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="workflows.panel"]'),
      }),
      domOnboardingTarget({
        id: "workflows.new",
        label: "Create workflow",
        reveal: () => openWorkflows(sessions),
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="workflows.new"]'),
      }),
      domOnboardingTarget({
        id: "workflows.run",
        label: "Review and run workflow",
        reveal: () => openWorkflows(sessions),
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="workflows.run"]'),
      }),
    ],
    journeys: [{
      id: "workflows-native.create-and-run",
      title: "Turn repeatable work into a workflow",
      description: "Find or author a parameterized workflow, review its generated command, and choose where it runs.",
      order: 80,
      estimatedMinutes: 4,
      presentation: "contextual",
      steps: [
        {
          id: "entry",
          version: 1,
          kind: "tour",
          title: "Workflows live beside Chat and coding agents",
          scope: { kind: "user" },
          targetId: "workflows.entry",
          body: {
            markdown: "Workflows are durable, searchable command recipes. Chat can explain or invoke them, but the definitions and execution policy remain owned by the Workflows plugin.",
          },
        },
        {
          id: "library",
          version: 1,
          kind: "tour",
          title: "Reuse a reviewed operational path",
          scope: { kind: "rig" },
          targetId: "workflows.panel",
          body: {
            markdown: "Built-in, plugin-contributed, and user workflows share one library. Live badges identify recipes whose parameters come from current Git, container, SSH, port, or terminal state.",
          },
        },
        {
          id: "author",
          version: 1,
          kind: "tour",
          title: "Author inputs instead of hiding shell strings",
          scope: { kind: "profile" },
          targetId: "workflows.new",
          body: {
            markdown: "Create a workflow with named parameters, a target policy, and an optional second confirmation for destructive work. Company plugins can contribute the same public definition contract.",
          },
        },
        {
          id: "run",
          version: 1,
          kind: "tour",
          title: "Review before execution",
          scope: { kind: "rig" },
          targetId: "workflows.run",
          body: {
            markdown: "Open the run sheet to resolve live values, inspect the generated command, and select local terminal, SSH rig, container, or AI target when supported. Nothing runs merely because the tour is open.",
          },
        },
      ],
    }],
  };
}
