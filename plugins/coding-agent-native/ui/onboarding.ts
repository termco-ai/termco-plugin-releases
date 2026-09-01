import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";

let panelVisible: () => void = () => {};
let showRoster: () => void = () => {};

export function configureCodingAgentOnboardingSuggestion(
  suggest: () => void,
): () => void {
  panelVisible = suggest;
  return () => {
    if (panelVisible === suggest) panelVisible = () => {};
  };
}

export function notifyCodingAgentPanelVisible(): void {
  panelVisible();
}

export function configureCodingAgentOnboardingRoster(
  reveal: () => void,
): () => void {
  showRoster = reveal;
  return () => {
    if (showRoster === reveal) showRoster = () => {};
  };
}

async function openAgents(sessions: AiSessionsCapability): Promise<void> {
  sessions.openPanel();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const button = document.querySelector<HTMLButtonElement>(
      '[data-onboarding-target="ai-dock.mode.agents"]',
    );
    if (button) {
      button.click();
      return;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function openRoster(sessions: AiSessionsCapability): Promise<void> {
  await openAgents(sessions);
  showRoster();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

const target = (id: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${id}"]`);

export function createCodingAgentOnboardingContribution(
  sessions: AiSessionsCapability,
): OnboardingContribution {
  return {
    id: "coding-agent-guidance",
    targets: [
      domOnboardingTarget({ id: "coding-agents.entry", label: "Coding Agents dock tab", reveal: () => sessions.openPanel(), element: () => target("ai-dock.mode.agents") }),
      domOnboardingTarget({ id: "coding-agents.roster", label: "Coding Agent runs", reveal: () => openRoster(sessions), element: () => target("coding-agents.roster") }),
      domOnboardingTarget({ id: "coding-agents.new", label: "Start coding agent", reveal: () => openRoster(sessions), element: () => target("coding-agents.new") }),
      domOnboardingTarget({ id: "coding-agents.backend", label: "Coding Agent backend", element: () => target("coding-agents.backend"), unavailableMessage: "Choose New in the Agents dock to configure a coding-agent run." }),
      domOnboardingTarget({ id: "coding-agents.autonomy", label: "Coding Agent autonomy", element: () => target("coding-agents.autonomy"), unavailableMessage: "Choose New in the Agents dock to configure autonomy." }),
      domOnboardingTarget({ id: "coding-agents.task", label: "Coding Agent task", element: () => target("coding-agents.task"), unavailableMessage: "Choose New in the Agents dock to enter a task." }),
      domOnboardingTarget({ id: "coding-agents.external", label: "Connect external agent", reveal: () => openRoster(sessions), element: () => target("coding-agents.external") }),
    ],
    journeys: [{
      id: "coding-agent-native.run-and-control",
      title: "Run and control coding agents",
      description: "Start Claude Code or Codex on the active rig, choose autonomy, inspect streaming work, and expose bounded Termco tools through MCP.",
      order: 90,
      estimatedMinutes: 5,
      presentation: "contextual",
      steps: [
        {
          id: "entry",
          version: 1,
          kind: "tour",
          title: "Coding agents are a first-class Termco surface",
          scope: { kind: "user" },
          targetId: "coding-agents.entry",
          body: { markdown: "The Agents dock starts and supervises native Claude Code and Codex processes. Runs keep streaming when you switch tabs or rigs, and attention appears in the shared activity UI." },
        },
        {
          id: "roster",
          version: 1,
          kind: "tour",
          title: "Runs and history follow the active rig",
          scope: { kind: "rig" },
          targetId: "coding-agents.roster",
          body: { markdown: "The roster shows active and recent runs plus existing CLI history from the selected machine. On an SSH rig, discovery and execution happen on that server rather than silently falling back to the local Mac." },
        },
        {
          id: "new",
          version: 1,
          kind: "interaction",
          title: "Configure a real run",
          scope: { kind: "rig" },
          targetId: "coding-agents.new",
          expectation: { kind: "click" },
          body: { markdown: "Choose New. The form probes which CLIs are installed in the active environment and keeps the working directory paired with that same rig." },
        },
        {
          id: "backend",
          version: 1,
          kind: "interaction",
          title: "Choose Claude Code or Codex",
          scope: { kind: "rig" },
          targetId: "coding-agents.backend",
          expectation: { kind: "click" },
          body: { markdown: "Select the backend whose installed CLI and existing login you want to reuse. Termco supervises the process; it does not replace the vendor account or hide which engine is running." },
        },
        {
          id: "autonomy",
          version: 1,
          kind: "interaction",
          title: "Set the approval boundary",
          scope: { kind: "rig" },
          targetId: "coding-agents.autonomy",
          expectation: { kind: "click" },
          body: { markdown: "Choose how independently this run may act. The same policy gates app-control tools exposed through Termco's MCP server, so terminal, files, Git, containers, previews, and rig actions remain visible and scoped." },
        },
        {
          id: "task",
          version: 1,
          kind: "interaction",
          title: "Give the run an outcome",
          scope: { kind: "rig" },
          targetId: "coding-agents.task",
          expectation: { kind: "input", completion: "non-empty" },
          body: { markdown: "Describe the task. Once started, Termco shows normalized streaming output, tool work, approvals, cost and context state, resumable history, checkpoints, and a trajectory for reviewing what happened." },
        },
        {
          id: "external",
          version: 1,
          kind: "tour",
          title: "External agents can control Termco through MCP",
          scope: { kind: "user" },
          targetId: "coding-agents.external",
          body: { markdown: "Connect a hand-run Claude, Codex, opencode, or another MCP client with a revocable token. Termco exposes bounded application tools and selects the rig from the agent's working directory instead of granting unrestricted desktop access." },
        },
      ],
    }],
  };
}
