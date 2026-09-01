import {
  CODING_AGENT_EVENTS,
  type CodingAgentsCapability,
  type CodingAgentsUiCapability,
} from "@termco/agents-base";
import { AI_SESSIONS_SERVICE, type AiSessionsCapability } from "@termco/ai-sessions-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import {
  processTransportService,
  type PluginModule,
  type ProcessTransport,
} from "@termco/kernel";
import {
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRegistry,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import type { McpServerCapability } from "@termco/mcp-base";
import {
  SESSION_QUERY_SERVICE,
  type SessionQueryCapability,
} from "@termco/session-base";
import {
  TRAJECTORY_NAVIGATION_SERVICE,
  type TrajectoryNavigationCapability,
} from "@termco/trajectory-base";
import type {
  UiAiDockRuntime,
  UiAiDockViewContribution,
  UiAiDockViewController,
  UiAiDockViewRegistry,
} from "@termco/ui-dock-base";
import { CodingAgentsPanel } from "./components/CodingAgentsPanel";
import {
  pendingAgentRunId,
  requestAgentRunDetail,
  usePendingAgentRun,
} from "./lib/openRunDetail";
import {
  countUnseen,
  useCodingAgentsStore,
} from "./store/codingAgentsStore";
import {
  codingAgentUiRuntime,
  configureCodingAgentUiRuntime,
  type CodingAgentUiRuntime,
} from "./runtime";
import { AGENTS_CODING_SESSIONS_SERVICE } from "@termco/agents-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { MCP_SERVER_SERVICE } from "@termco/mcp-base";
import { UI_AI_DOCK_VIEWS_SERVICE } from "@termco/ui-dock-base";
import {
  configureCodingAgentOnboardingSuggestion,
  createCodingAgentOnboardingContribution,
} from "./onboarding";

const controller: UiAiDockViewController = {
  subscribe(listener) {
    const offRuns = useCodingAgentsStore.subscribe(listener);
    const offOpen = usePendingAgentRun.subscribe(listener);
    return () => {
      offRuns();
      offOpen();
    };
  },
  badge: () => countUnseen(useCodingAgentsStore.getState().runs),
  consumeOpenRequest: () =>
    pendingAgentRunId(usePendingAgentRun.getState().pending) !== null,
};

function AgentsDockView({ runtime }: { runtime: UiAiDockRuntime }) {
  return <CodingAgentsPanel runtime={runtime} />;
}

const dock: UiAiDockViewContribution = {
  id: "agents",
  label: "Agents",
  description: "Start, monitor, resume, and control coding-agent runs.",
  order: 10,
  controller,
  Component: AgentsDockView,
};

const codingUi: CodingAgentsUiCapability = {
  start: (input) =>
    useCodingAgentsStore.getState().startRun({
      backend: input.backend,
      prompt: input.prompt,
      cwd: input.cwd,
      model: input.model,
      permissionMode: input.permissionMode,
      effort: input.effort,
      supervisorChatId: input.supervisorChatId,
      resumeSessionId: input.resumeSessionId,
      workspace: input.workspace,
      rigId: input.rigId,
      runId: input.runId,
      now: input.now,
    }),
  snapshot(runId) {
    const run = useCodingAgentsStore.getState().runs[runId];
    if (!run) return null;
    const toolNames: string[] = [];
    const text: string[] = [];
    for (const message of run.messages) {
      for (const part of message.parts as Array<{
        type?: string;
        text?: string;
      }>) {
        if (part.type?.startsWith("tool-")) toolNames.push(part.type.slice(5));
        if (
          message.role === "assistant" &&
          part.type === "text" &&
          typeof part.text === "string"
        ) {
          text.push(part.text);
        }
      }
    }
    return {
      status: run.status,
      pendingApprovalId: run.pendingApprovalId,
      toolNames,
      error: run.error,
      text: text.join("\n"),
    };
  },
  respondApproval: (runId, approvalId, allow) => {
    void useCodingAgentsStore
      .getState()
      .respondApproval(runId, approvalId, allow);
  },
  openRun: requestAgentRunDetail,
  async rewindCheckpoint({ runId, reference }) {
    const turnIndex = (reference as { turnIndex?: unknown } | null)?.turnIndex;
    if (typeof turnIndex !== "number") {
      return { ok: false, error: "checkpoint does not contain a turn index" };
    }
    const runs = await codingAgentUiRuntime().agents.invoke("agent_runs_list", {}) as Array<{
      runId: string;
      cwd?: string;
    }>;
    const cwd = runs.find((run) => run.runId === runId)?.cwd;
    if (!cwd) return { ok: false, error: "run is not loaded" };
    return await codingAgentUiRuntime().agents.invoke("agent_run_rewind", {
      runId,
      turnIndex,
      cwd,
    }) as { ok: boolean; error?: string };
  },
  debugSeedRun({ runId, rigId, title }) {
    useCodingAgentsStore.setState((state) => ({
      runs: {
        ...state.runs,
        [runId]: {
          runId,
          seq: 1,
          messages: [],
          status: "idle",
          sessionId: runId,
          model: "opus",
          cwd: "/repo",
          usage: null,
          costUsd: null,
          pendingApprovalId: null,
          error: null,
          backend: "claude",
          title,
          permissionMode: "default",
          createdAt: Date.now(),
          rigId,
        },
      },
    }));
  },
};

export function createRendererCodingAgents(
  transport: ProcessTransport,
): CodingAgentsCapability {
  return {
    commands: () => [],
    invoke(command, payload) {
      return transport.call(
        AGENTS_CODING_SESSIONS_SERVICE,
        "invoke",
        [command, payload],
        { caller: true },
      );
    },
    killAll() {
      void transport.call(AGENTS_CODING_SESSIONS_SERVICE, "killAll", []);
    },
    liveResources: () => [],
  };
}

type E2EHost = {
  __termco?: { e2e?: boolean };
  __termcoE2E?: Record<string, unknown>;
};

export function installCodingAgentsE2E(
  host: E2EHost,
  ui: CodingAgentsUiCapability,
): () => void {
  if (!host.__termco?.e2e) return () => {};
  const seam = (host.__termcoE2E ??= {});
  const debugSeedRun = (input: {
    runId: string;
    rigId: string;
    title: string;
  }) => ui.debugSeedRun(input);
  const codingAgentsStart: CodingAgentsUiCapability["start"] = (input) =>
    ui.start(input);
  const codingAgentsSnapshot: CodingAgentsUiCapability["snapshot"] = (runId) =>
    ui.snapshot(runId);
  const codingAgentsRespondApproval: CodingAgentsUiCapability["respondApproval"] = (
    runId,
    approvalId,
    allow,
  ) => ui.respondApproval(runId, approvalId, allow);
  Object.assign(seam, {
    debugSeedRun,
    codingAgentsStart,
    codingAgentsSnapshot,
    codingAgentsRespondApproval,
  });
  return () => {
    if (seam.debugSeedRun === debugSeedRun) delete seam.debugSeedRun;
    if (seam.codingAgentsStart === codingAgentsStart) {
      delete seam.codingAgentsStart;
    }
    if (seam.codingAgentsSnapshot === codingAgentsSnapshot) {
      delete seam.codingAgentsSnapshot;
    }
    if (seam.codingAgentsRespondApproval === codingAgentsRespondApproval) {
      delete seam.codingAgentsRespondApproval;
    }
  };
}

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
    processTransportService,
    MCP_SERVER_SERVICE,
    UI_AI_DOCK_VIEWS_SERVICE,
  ],
  optionalInject: [
    SESSION_QUERY_SERVICE,
    TRAJECTORY_NAVIGATION_SERVICE,
    AI_SESSIONS_SERVICE,
    ONBOARDING_REGISTRY_SERVICE,
    ONBOARDING_RUNTIME_SERVICE,
  ],
  async activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    const agents = createRendererCodingAgents(transport);
    context.provide(AGENTS_CODING_SESSIONS_SERVICE, agents);
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    context.feature(
      {
        id: "onboarding:coding-agent-guidance",
        label: "Coding Agent guidance",
        requires: [ONBOARDING_REGISTRY_SERVICE, AI_SESSIONS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => {
        const contribution = createCodingAgentOnboardingContribution(
          scope.get<AiSessionsCapability>(AI_SESSIONS_SERVICE),
        );
        return scope.get<OnboardingRegistry>(ONBOARDING_REGISTRY_SERVICE).register(
          contribution,
          { pluginId: context.pluginId, generation: context.generation, key: contribution.id },
        );
      },
    );
    context.feature(
      {
        id: "onboarding:coding-agent-context",
        label: "Contextual Coding Agent guidance",
        requires: [ONBOARDING_RUNTIME_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => configureCodingAgentOnboardingSuggestion(() => {
        void scope.get<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE)
          .suggest("coding-agent-native.run-and-control");
      }),
    );
    const runtime: CodingAgentUiRuntime = {
      agents,
      events,
      mcp: context.get<McpServerCapability>("mcp.server"),
      query: null,
      trajectory: null,
    };
    await context.effect(() => {
      configureCodingAgentUiRuntime(runtime);
      return () => configureCodingAgentUiRuntime(null);
    });
    context.feature(
      {
        id: "session-query",
        label: "Semantic coding-agent session lookup",
        requires: [SESSION_QUERY_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => scope.effect(() => {
        runtime.query = scope.get<SessionQueryCapability>(SESSION_QUERY_SERVICE);
        return () => { runtime.query = null; };
      }),
    );
    context.feature(
      {
        id: "trajectory-navigation",
        label: "Open coding-agent sessions in Trajectory",
        requires: [TRAJECTORY_NAVIGATION_SERVICE],
        uiPolicy: "remove",
      },
      (scope) => scope.effect(() => {
        runtime.trajectory = scope.get<TrajectoryNavigationCapability>(TRAJECTORY_NAVIGATION_SERVICE);
        return () => { runtime.trajectory = null; };
      }),
    );

    const requestRun = (payload: unknown) => {
      const runId = (payload as { runId?: unknown } | null)?.runId;
      if (typeof runId === "string" && runId) requestAgentRunDetail(runId);
    };
    await context.effect(() =>
      events.subscribe(CODING_AGENT_EVENTS.focusRun, requestRun),
    );
    await context.effect(() =>
      installCodingAgentsE2E(window as unknown as E2EHost, codingUi),
    );
    context.provide("agents.coding-ui", codingUi);
    await context.effect(() =>
      context.get<UiAiDockViewRegistry>("ui.ai-dock.views").register(dock, {
        pluginId: "coding-agent-native",
        generation: context.generation,
        key: dock.id,
      }),
    );
  },
};

export default plugin;
