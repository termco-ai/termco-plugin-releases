import type { PluginModule } from "@termco/kernel";
import {
  contributeOnboarding,
  ONBOARDING_REGISTRY_SERVICE,
  type OnboardingContribution,
} from "@termco/onboarding-base";

/** Product stories compose targets supplied by feature owners. */
export function createTermcoOnboardingContribution(): OnboardingContribution {
  return {
    id: "termco-product-stories",
    journeys: [
      {
        id: "termco.first-value",
        title: "Start working in Termco",
        description: "Connect a model, understand rigs, and make the first AI-assisted request in the real workspace.",
        order: 0,
        estimatedMinutes: 3,
        presentation: "automatic",
        steps: [
          {
            id: "welcome",
            version: 1,
            kind: "information",
            title: "A developer workspace made from plugins",
            scope: { kind: "user" },
            body: { markdown: "Termco brings terminals, files, Git, previews, containers, remote rigs, AI, workflows, and coding agents into one workspace. Every user-facing capability is owned by a profile-selected plugin." },
          },
          {
            id: "model",
            version: 1,
            kind: "tour",
            title: "Connect the model you want to use",
            scope: { kind: "user" },
            targetId: "models.overview",
            body: { markdown: "Choose a hosted provider, local runtime, or compatible endpoint. Termco has no required model account, and credentials stay in the OS keychain rather than in portable profiles." },
          },
          {
            id: "rig",
            version: 1,
            kind: "tour",
            title: "Know where the work runs",
            scope: { kind: "user" },
            targetId: "header.rig-strip",
            body: { markdown: "The active rig is the execution context for the workspace. Start locally now; later, add a project folder or SSH server without changing the rest of the Termco workflow." },
          },
          {
            id: "next",
            version: 1,
            kind: "information",
            title: "Learn each capability when it becomes relevant",
            scope: { kind: "user" },
            body: { markdown: "Open Chat for the guided first-request journey. Rigs, Containers, Workflows, coding agents, Plugins, and Profiles offer their own short journey the first time you enter them, and every journey remains replayable in Getting Started." },
          },
        ],
      },
      {
        id: "termco.developer-story",
        title: "Follow a project from local code to remote operation",
        description: "Understand a project, ask AI to help, automate the result, move it to a rig, and supervise coding agents.",
        order: 100,
        estimatedMinutes: 12,
        presentation: "available",
        steps: [
          { id: "project", version: 1, kind: "tour", title: "Begin with a project rig", scope: { kind: "workspace" }, targetId: "header.rig-strip", body: { markdown: "The story begins with a real project, not a tutorial sandbox. Its files, terminal tabs, Git state, previews, and AI activity stay attached to one rig." } },
          { id: "chat", version: 1, kind: "tour", title: "Ask AI beside the code", scope: { kind: "workspace" }, targetId: "ai-chat.panel", body: { markdown: "Ask Termco to inspect the project and explain how it runs. Chat can return files, diffs, terminals, tables, charts, findings, questions, plans, and approvals—not only prose." } },
          { id: "agent", version: 1, kind: "tour", title: "Make the working mode explicit", scope: { kind: "user" }, targetId: "agents-manager.overview", body: { markdown: "Choose or create an agent that combines durable instructions with a visible tool set. Add reusable snippets, skills, and MCP servers to the same shared AI library." } },
          { id: "workflow", version: 1, kind: "tour", title: "Save the repeatable operation", scope: { kind: "profile" }, targetId: "workflows.panel", body: { markdown: "Turn the command sequence into a parameterized workflow. Its run sheet resolves live Git, SSH, container, port, and terminal values and previews the command before execution." } },
          { id: "remote", version: 1, kind: "tour", title: "Move the same workflow to a server", scope: { kind: "rig" }, targetId: "header.rig-overview", body: { markdown: "Add an SSH rig and keep using the same workspace model. Terminals, files, containers, forwarded previews, workflows, and agents now run through the shared remote connection." } },
          { id: "containers", version: 1, kind: "tour", title: "Operate the active rig's containers", scope: { kind: "rig" }, targetId: "containers.panel", body: { markdown: "Inspect runtime health, logs, resource use, environment, ports, and actions without losing whether the target is local or remote." } },
          { id: "coding-agent", version: 1, kind: "tour", title: "Supervise coding agents inside Termco", scope: { kind: "rig" }, targetId: "coding-agents.roster", body: { markdown: "Start Claude Code or Codex on the chosen rig, select autonomy, watch tool work, respond to approvals, resume history, rewind checkpoints, and expose bounded Termco tools through MCP." } },
        ],
      },
      {
        id: "termco.extend-and-share",
        title: "Adapt Termco and share the result",
        description: "Inspect an existing feature, create or fork a plugin, verify its effect, and package the company setup as a portable profile.",
        order: 110,
        estimatedMinutes: 8,
        presentation: "available",
        steps: [
          { id: "composition", version: 1, kind: "tour", title: "Start from the live plugin composition", scope: { kind: "profile" }, targetId: "plugin-manager.catalog", body: { markdown: "Every visible feature identifies its owner and dependency state. Filter the catalog to understand what is active, inactive, reduced, blocked, or failed before changing the profile." } },
          { id: "fork", version: 1, kind: "tour", title: "Change an existing feature or create a new one", scope: { kind: "profile" }, targetId: "plugin-manager.fork", body: { markdown: "Fork a complete source-owned feature, or ask the Plugin Creator agent for a new outcome. It clarifies the goal, confirms a brief, plans against public contracts, applies the draft transactionally, and verifies the visible result." } },
          { id: "profile", version: 1, kind: "tour", title: "Create the company profile", scope: { kind: "profile" }, targetId: "profile-manager.overview", body: { markdown: "Name and version the reviewed composition. Customized plugin source, selected state, portable defaults, and plugin-owned journeys travel in the package; secrets and personal activity do not." } },
          { id: "handoff", version: 1, kind: "tour", title: "Validate the handoff before activation", scope: { kind: "profile" }, targetId: "profile-manager.import", body: { markdown: "A teammate imports the package as a new validated profile. Their keys, SSH secrets, workspaces, history, processes, and onboarding progress remain local." } },
        ],
      },
    ],
  };
}

const plugin: PluginModule = {
  optionalInject: [ONBOARDING_REGISTRY_SERVICE],
  activate(context) {
    contributeOnboarding(
      context,
      createTermcoOnboardingContribution(),
      "Termco product stories",
    );
  },
};

export default plugin;
