import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";
import type { UiAgentsViewCapability } from "@termco/ui-agents-base";

const contributionElement = (selected: boolean) =>
  [...document.querySelectorAll<HTMLElement>(
    '[data-contribution-service="ui.sidebar.views"][data-contribution-key="containers"]',
  )].find((candidate) =>
    selected
      ? candidate.dataset.contributionSelected === "true" && candidate.tagName !== "BUTTON"
      : candidate.tagName === "BUTTON"
  );

export function createContainersOnboardingContribution(
  navigation: UiSidebarNavigationCapability,
  settings: UiSettingsViewCapability,
  agents: UiAgentsViewCapability,
): OnboardingContribution {
  const showWorkspace = () => {
    settings.close();
    agents.close();
  };
  const show = () => {
    showWorkspace();
    navigation.show("containers");
  };
  return {
    id: "containers-guidance",
    targets: [
      domOnboardingTarget({
        id: "containers.rail",
        label: "Containers sidebar",
        reveal: showWorkspace,
        element: () => contributionElement(false),
      }),
      domOnboardingTarget({
        id: "containers.panel",
        label: "Container runtime overview",
        reveal: show,
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="containers.panel"]'),
      }),
      domOnboardingTarget({
        id: "containers.card",
        label: "Container actions",
        reveal: show,
        element: () => document.querySelector<HTMLElement>('[data-onboarding-target="containers.card"]'),
        unavailableMessage: "Start a local or remote container to continue this optional step.",
      }),
    ],
    journeys: [{
      id: "containers-native.manage-runtime",
      title: "Manage containers on any rig",
      description: "Inspect runtime health, open container details, and run controlled actions locally or over SSH.",
      order: 70,
      estimatedMinutes: 4,
      presentation: "contextual",
      steps: [
        {
          id: "entry",
          version: 1,
          kind: "tour",
          title: "Containers follow the active rig",
          scope: { kind: "rig" },
          targetId: "containers.rail",
          body: {
            markdown: "The same Containers entry follows the selected local, WSL, or SSH rig. Termco discovers Docker, Podman, or Apple containers through the rig's execution provider.",
          },
        },
        {
          id: "overview",
          version: 1,
          kind: "tour",
          title: "See runtime state without leaving the workspace",
          scope: { kind: "rig" },
          targetId: "containers.panel",
          placement: "right",
          body: {
            markdown: "The panel reports loading, connection, missing-runtime, empty, and live-container states explicitly. Refreshing uses the active rig rather than a second hidden Docker connection.",
          },
        },
        {
          id: "actions",
          version: 1,
          kind: "tour",
          title: "Open details or act on a container",
          optional: true,
          scope: { kind: "rig" },
          targetId: "containers.card",
          body: {
            markdown: "Open a card for logs, inspect data, resource usage, environment, and ports. Start, stop, restart, shell, and forwarding actions remain visible and use the shared terminal and browser capabilities.",
          },
        },
      ],
    }],
  };
}
