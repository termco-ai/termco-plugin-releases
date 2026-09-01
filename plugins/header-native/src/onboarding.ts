import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";
import type { WorkspaceRigOverviewCapability } from "@termco/workspace-base";

const target = (id: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${id}"]`);

export function createRigsOnboardingContribution(
  overview: WorkspaceRigOverviewCapability,
): OnboardingContribution {
  return {
    id: "rigs-guidance",
    targets: [
      domOnboardingTarget({ id: "header.rig-strip", label: "Rig strip", element: () => target("header.rig-strip") }),
      domOnboardingTarget({ id: "header.rig-overview", label: "Rig overview", reveal: () => overview.setOpen(true), element: () => target("header.rig-overview") }),
      domOnboardingTarget({ id: "header.rig-row", label: "Rig and its tabs", reveal: () => overview.setOpen(true), element: () => target("header.rig-row") }),
      domOnboardingTarget({ id: "header.new-rig", label: "New rig menu", reveal: () => overview.setOpen(true), element: () => target("header.new-rig") }),
      domOnboardingTarget({
        id: "header.rig-types",
        label: "Local and SSH rig choices",
        element: () => target("header.rig-types"),
        unavailableMessage: "Open New rig to compare local and SSH workspace choices.",
      }),
    ],
    journeys: [{
      id: "header-native.local-and-remote-rigs",
      title: "Work locally and on SSH rigs",
      description: "Understand the execution context that keeps terminals, files, containers, previews, and agents together.",
      order: 60,
      estimatedMinutes: 4,
      presentation: "contextual",
      steps: [
        {
          id: "strip",
          version: 1,
          kind: "tour",
          title: "A rig is a complete execution context",
          scope: { kind: "user" },
          targetId: "header.rig-strip",
          body: { markdown: "Each header chip is a rig. Selecting one keeps its workspace root, tabs, terminal sessions, files, Git state, containers, forwarded ports, Chat context, and coding-agent runs together." },
        },
        {
          id: "overview",
          version: 1,
          kind: "tour",
          title: "Manage rigs and their tabs",
          scope: { kind: "user" },
          targetId: "header.rig-overview",
          body: { markdown: "The overview searches both rigs and tabs. Switch contexts, rename or reorder rigs, create a tab inside a rig, and drag a tab to another rig without losing where it runs." },
        },
        {
          id: "row",
          version: 1,
          kind: "interaction",
          title: "Inspect one rig",
          scope: { kind: "rig" },
          targetId: "header.rig-row",
          expectation: { kind: "click" },
          body: { markdown: "Select a rig row to activate it, or expand it to see the tabs that belong to that environment. The same UI works for the launch workspace, local project folders, and remote servers." },
        },
        {
          id: "new",
          version: 1,
          kind: "interaction",
          title: "Choose a new execution environment",
          scope: { kind: "user" },
          targetId: "header.new-rig",
          expectation: { kind: "click" },
          body: { markdown: "Open New rig. The creation flow is deliberately a visible choice between this Mac and a remote SSH target." },
        },
        {
          id: "types",
          version: 1,
          kind: "tour",
          title: "Start locally or connect a server",
          scope: { kind: "user" },
          targetId: "header.rig-types",
          body: { markdown: "Create a local workspace immediately, select a host discovered from `~/.ssh/config`, or type `user@host[:port]`. Remote terminals and agents reuse the shared SSH capability rather than opening an unrelated connection." },
        },
      ],
    }],
  };
}
