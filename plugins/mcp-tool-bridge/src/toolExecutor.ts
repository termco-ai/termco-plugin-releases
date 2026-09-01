import type { AiLiveCapability } from "@termco/ai-live-base";
import type {
  AiToolExecutionCapability,
  AiToolRegistry,
} from "@termco/ai-tools-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { createRigToolRuntime } from "./rigToolRuntime";
import {
  buildExposedTools,
  buildMcpSurface,
  isRunOnlyTool,
  mcpSurfaceNames,
} from "./toolSurface";

export type McpToolRequest = {
  requestId: string;
  rigId: string;
  toolName: string;
  input: Record<string, unknown>;
};

export type McpToolReply =
  | { requestId: string; ok: true; result: unknown }
  | {
      requestId: string;
      ok: false;
      error: { code: string; message: string };
    };

export interface McpToolRuntime {
  surface(): Promise<unknown[]>;
  execute(request: unknown): Promise<unknown>;
  subscribe(listener: () => void): () => void;
}

function values(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function request(value: unknown): McpToolRequest {
  const input = values(value);
  return {
    requestId: String(input.requestId ?? ""),
    rigId: String(input.rigId ?? ""),
    toolName: String(input.toolName ?? ""),
    input: values(input.input),
  };
}

/** Translate AI-SDK-style rich output to MCP content blocks. */
export function toMcpContent(
  modelContent: unknown,
): { content: unknown[] } | null {
  const result = modelContent as { type?: string; value?: unknown };
  if (result?.type !== "content" || !Array.isArray(result.value)) return null;
  return {
    content: result.value.map((part) => {
      const item = values(part);
      if (item.type === "text") {
        return { type: "text", text: String(item.text ?? "") };
      }
      if (item.type === "image-data" || item.type === "image") {
        return {
          type: "image",
          data: String(item.data ?? ""),
          mimeType: String(item.mediaType ?? item.mimeType ?? "image/png"),
        };
      }
      return { type: "text", text: JSON.stringify(item) };
    }),
  };
}

function error(
  req: McpToolRequest,
  code: string,
  message: string,
): McpToolReply {
  return { requestId: req.requestId, ok: false, error: { code, message } };
}

export function createMcpToolRuntime(dependencies: {
  contributions: Pick<AiToolRegistry, "snapshot" | "subscribe">;
  execution: AiToolExecutionCapability;
  approve(input: {
    requestId: string;
    resolution: Awaited<ReturnType<AiToolExecutionCapability["resolveApproval"]>>;
  }): Promise<{
    allow: boolean;
    outcome?: "allowed-once" | "allowed-by-policy" | "rejected" | "cancelled" | "unavailable";
    responder?: "user" | "policy" | "parent";
    message?: string;
  }>;
  live: AiLiveCapability | (() => AiLiveCapability | undefined);
  rigs: WorkspaceRigsCapability | (() => WorkspaceRigsCapability | undefined);
}): McpToolRuntime {
  const currentLive = () =>
    typeof dependencies.live === "function"
      ? dependencies.live()
      : dependencies.live;
  const currentRigs = () =>
    typeof dependencies.rigs === "function"
      ? dependencies.rigs()
      : dependencies.rigs;
  return {
    async surface() {
      return buildMcpSurface(dependencies.contributions.snapshot());
    },
    async execute(payload) {
      const req = request(payload);
      const contributions = dependencies.contributions.snapshot();
      const exposedNames = new Set(mcpSurfaceNames(contributions));
      try {
        if (!exposedNames.has(req.toolName)) {
          return error(
            req,
            "unknown-tool",
            `Tool "${req.toolName}" is not exposed over MCP.`,
          );
        }
        if (isRunOnlyTool(req.toolName)) {
          return error(
            req,
            "not-dispatchable",
            `Tool "${req.toolName}" cannot be run this way.`,
          );
        }
        const live = currentLive();
        const rigs = currentRigs();
        const tools = buildExposedTools(
          contributions,
          live && rigs
            ? createRigToolRuntime(req.rigId, live, rigs)
            : { getSessionId: () => null, readCache: new Map() },
        );
        const tool = tools[req.toolName];
        if (!tool?.execute) {
          return error(
            req,
            "not-dispatchable",
            `Tool "${req.toolName}" cannot be run this way.`,
          );
        }
        const executed = await dependencies.execution.executeStandalone({
          backend: "mcp-tool",
          externalRequestId: req.requestId,
          rigId: req.rigId,
          name: req.toolName,
          input: req.input,
          contributor: {
            pluginId: "mcp-tool-bridge",
            contributionId: req.toolName,
          },
          definition: tool,
          authorize: ({ resolution }) => dependencies.approve({
            requestId: req.requestId,
            resolution,
          }),
        });
        if (!executed.ok) {
          return error(req, executed.error.code.toLowerCase().replaceAll("_", "-"), executed.error.message);
        }
        const shaped = toMcpContent(executed.modelContent);
        return {
          requestId: req.requestId,
          ok: true,
          result: shaped ?? executed.output,
        } satisfies McpToolReply;
      } catch (cause) {
        return error(
          req,
          "tool-threw",
          cause instanceof Error ? cause.message : String(cause),
        );
      }
    },
    subscribe(listener) {
      return dependencies.contributions.subscribe(listener);
    },
  };
}
