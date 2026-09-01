import type { McpServerCapability } from "@termco/mcp-base";
import type { McpToolRuntime } from "./toolExecutor";

type BridgeDependencies = {
  server: Pick<McpServerCapability, "invoke">;
  createReceiver(listener: (message: unknown) => void): {
    marker: unknown;
    dispose(): void;
  };
  tools: Pick<McpToolRuntime, "surface" | "execute" | "subscribe">;
  addApproval(request: unknown): Promise<void>;
  addInteraction(interaction: unknown): Promise<void>;
  onError?(error: Error): void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** Start one renderer generation of the MCP bridge and return complete cleanup. */
export function startMcpToolBridge(deps: BridgeDependencies): () => void {
  let disposed = false;
  let registered = false;
  let surfaceRevision = 0;
  const report = (error: unknown) => deps.onError?.(new Error(message(error)));
  const publishSurface = () => {
    if (!registered) return;
    const revision = ++surfaceRevision;
    void deps.tools
      .surface()
      .then((tools) =>
        disposed || revision !== surfaceRevision
          ? undefined
          : deps.server.invoke("mcp_surface_register", { tools }),
      )
      .catch(report);
  };

  const receive = (incoming: unknown) => {
    const envelope = record(incoming);
    const event = String(envelope.event ?? "");
    const payload = envelope.payload;
    if (event === "mcp:tool-request") {
      void deps.tools
        .execute(payload)
        .then((reply) => deps.server.invoke("mcp_tool_result", record(reply)))
        .catch((error) => {
          const requestId = String(record(payload).requestId ?? "");
          return deps.server.invoke("mcp_tool_result", {
            requestId,
            ok: false,
            error: { code: "bridge-failed", message: message(error) },
          });
        })
        .catch(report);
      return;
    }
    if (event === "mcp:approval-request") {
      void deps.addApproval(payload).catch(report);
      return;
    }
    if (event === "mcp:run-interaction") {
      void deps.addInteraction(payload).catch(report);
    }
  };
  const receiver = deps.createReceiver(receive);

  void deps.server
    .invoke("mcp_bridge_register", { receiver: receiver.marker })
    .then(() => {
      if (disposed) return;
      registered = true;
      publishSurface();
    })
    .catch(report);

  const unsubscribeTools = deps.tools.subscribe(publishSurface);

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribeTools();
    void deps.server.invoke("mcp_surface_register", { tools: [] }).catch(report);
    void deps.server
      .invoke("mcp_bridge_unregister", {})
      .catch(report)
      .finally(receiver.dispose);
  };
}
