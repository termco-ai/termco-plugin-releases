import type { AiLiveCapability } from "@termco/ai-live-base";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import type { AiToolExecutionCapability } from "@termco/ai-tools-base";
import {
  type PluginModule,
  type ProcessTransport,
  processTransportService,
} from "@termco/kernel";
import type { McpServerCapability } from "@termco/mcp-base";
import type {
  UiOverlayContribution,
  UiOverlayRegistry,
} from "@termco/ui-overlays-base";
import type {
  UiBackgroundContribution,
  UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { startMcpToolBridge } from "./bridge";
import { McpApprovalOverlay } from "./McpApprovalOverlay";
import { createMcpApprovalStore } from "./mcpApprovalStore";
import { createMcpInteractionStore } from "./mcpInteractionStore";
import { createMcpToolRuntime } from "./toolExecutor";
import { AI_LIVE_SERVICE } from "@termco/ai-live-base";
import {
  AI_TOOL_EXECUTION_SERVICE,
  AI_TOOLS_SERVICE,
} from "@termco/ai-tools-base";
import { MCP_SERVER_SERVICE } from "@termco/mcp-base";
import { WORKSPACE_RIGS_SERVICE } from "@termco/workspace-base";
import { UI_OVERLAYS_SERVICE } from "@termco/ui-overlays-base";
import { UI_BACKGROUND_TASKS_SERVICE } from "@termco/ui-shell-base";

type E2EHost = {
  __termco?: { e2e?: boolean };
  __termcoE2E?: Record<string, unknown>;
};

export function installMcpToolBridgeE2E(
  host: E2EHost,
  addApproval: (request: unknown) => void,
): () => void {
  if (!host.__termco?.e2e) return () => {};
  const seam = (host.__termcoE2E ??= {});
  const mcpEmitApproval = (request: unknown) => addApproval(request);
  seam.mcpEmitApproval = mcpEmitApproval;
  return () => {
    if (seam.mcpEmitApproval === mcpEmitApproval) delete seam.mcpEmitApproval;
  };
}

function createBackground(
) {
  return function McpToolBridge() {
    return (
      <span
        hidden
        data-testid="mcp-tool-bridge-source"
        data-source-plugin="mcp-tool-bridge"
        data-status="active"
      />
    );
  };
}

const plugin: PluginModule = {
  inject: [
    MCP_SERVER_SERVICE,
    AI_TOOLS_SERVICE,
    AI_TOOL_EXECUTION_SERVICE,
    processTransportService,
  ],
  optionalInject: [AI_LIVE_SERVICE, WORKSPACE_RIGS_SERVICE],
  async activate(context) {
    const server = context.get<McpServerCapability>("mcp.server");
    const transport = context.get<ProcessTransport>(processTransportService);
    const reply = (requestId: string, value: unknown) =>
      server.invoke("mcp_renderer_reply", { requestId, value });
    const approvals = createMcpApprovalStore(reply);
    const interactions = createMcpInteractionStore(reply);
    await context.effect(() =>
      installMcpToolBridgeE2E(
        window as unknown as E2EHost,
        approvals.add,
      ),
    );
    const live = context.observe<AiLiveCapability>(AI_LIVE_SERVICE);
    const rigs = context.observe<WorkspaceRigsCapability>(WORKSPACE_RIGS_SERVICE);
    const tools = createMcpToolRuntime({
      contributions: context.get<AiToolRegistry>("ai.tools"),
      execution: context.get<AiToolExecutionCapability>(AI_TOOL_EXECUTION_SERVICE),
      approve: async ({ requestId, resolution }) => {
        const answer = await server.invoke("mcp_tool_approval", {
          requestId,
          resolution,
        });
        const value = answer && typeof answer === "object"
          ? answer as Record<string, unknown>
          : {};
        return {
          allow: value.allow === true,
          outcome:
            value.outcome === "allowed-once" ||
              value.outcome === "allowed-by-policy" ||
              value.outcome === "rejected" ||
              value.outcome === "cancelled" ||
              value.outcome === "unavailable"
              ? value.outcome
              : value.allow === true
                ? "allowed-by-policy"
                : "rejected",
          responder:
            value.responder === "user" ||
              value.responder === "policy" ||
              value.responder === "parent"
              ? value.responder
              : value.allow === true ? "policy" : "user",
          ...(typeof value.message === "string" ? { message: value.message } : {}),
        };
      },
      live: () => live.current(),
      rigs: () => rigs.current(),
    });
    await context.effect(() =>
      startMcpToolBridge({
        server,
        createReceiver(listener) {
          const marker = transport.registerChannel(listener);
          return {
            marker,
            dispose: () => transport.releaseChannel(marker),
          };
        },
        tools,
        addApproval: async (request) => approvals.add(request),
        addInteraction: async (interaction) => interactions.add(interaction),
        onError: () => {},
      }),
    );
    const contribution: UiBackgroundContribution = {
      id: "mcp-tool-bridge",
      label: "MCP tool bridge",
      description:
        "Publishes application tools and routes MCP requests through this renderer.",
      order: -20,
      Component: createBackground(),
    };
    const overlay: UiOverlayContribution = {
      id: "mcp-approval",
      label: "MCP approvals",
      description:
        "Shows approvals and managed-run interactions from the shared MCP server.",
      order: 80,
      Component: () => (
        <McpApprovalOverlay
          approvals={approvals}
          interactions={interactions}
        />
      ),
    };
    context.feature(
      {
        id: "background-status",
        label: "MCP tool bridge status",
        requires: [UI_BACKGROUND_TASKS_SERVICE],
        uiPolicy: "remove",
      },
      (scope) =>
        scope.effect(() =>
          scope
            .get<UiBackgroundRegistry>(UI_BACKGROUND_TASKS_SERVICE)
            .register(contribution, {
              pluginId: "mcp-tool-bridge",
              generation: context.generation,
              key: contribution.id,
            }),
        ),
    );
    context.feature(
      {
        id: "approval-overlay",
        label: "MCP approvals",
        requires: [UI_OVERLAYS_SERVICE],
        uiPolicy: "retain-disabled",
      },
      (scope) =>
        scope.effect(() =>
          scope.get<UiOverlayRegistry>(UI_OVERLAYS_SERVICE).register(overlay, {
            pluginId: "mcp-tool-bridge",
            generation: context.generation,
            key: overlay.id,
          }),
        ),
    );
  },
};

export default plugin;
