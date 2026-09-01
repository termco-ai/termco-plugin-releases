import type {
  AgentActivityCapability,
  AgentHooksCapability,
} from "@termco/agents-base";
import type {
  AiLiveCapability,
  AiLiveContributionRegistry,
} from "@termco/ai-live-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { PluginModule } from "@termco/kernel";
import type { TerminalSessionsCapability } from "@termco/terminal-base";
import { installManagedAgentRuntime } from "./runtime";
import {
  AGENTS_ACTIVITY_SERVICE,
  AGENTS_TERMINAL_HOOKS_SERVICE,
} from "@termco/agents-base";
import {
  AI_LIVE_CONTRIBUTIONS_SERVICE,
  AI_LIVE_SERVICE,
} from "@termco/ai-live-base";
import { AI_SESSIONS_SERVICE } from "@termco/ai-sessions-base";
import { TERMINAL_SESSIONS_SERVICE } from "@termco/terminal-base";

const plugin: PluginModule = {
  inject: [
    AGENTS_ACTIVITY_SERVICE,
    AGENTS_TERMINAL_HOOKS_SERVICE,
    AI_SESSIONS_SERVICE,
    TERMINAL_SESSIONS_SERVICE,
  ],
  async activate(context) {
    const runtime = installManagedAgentRuntime({
      activity: context.get<AgentActivityCapability>("agents.activity"),
      hooks: context.get<AgentHooksCapability>("agents.terminal-hooks"),
      sessions: context.get<AiSessionsCapability>("ai.sessions"),
      terminals: context.get<TerminalSessionsCapability>("terminal.sessions"),
    });
    await context.effect(() => runtime);
    context.feature(
      {
        id: "ai-live-presentation",
        label: "Managed-agent AI controls",
        requires: [AI_LIVE_SERVICE, AI_LIVE_CONTRIBUTIONS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          runtime.bindLive(
            scope.get<AiLiveCapability>(AI_LIVE_SERVICE),
            scope.get<AiLiveContributionRegistry>(
              AI_LIVE_CONTRIBUTIONS_SERVICE,
            ),
          ),
        ),
    );
  },
};

export default plugin;
