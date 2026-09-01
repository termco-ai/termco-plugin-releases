import {
  MCP_SERVER_SERVICE,
  type McpServerCapability,
} from "@termco/mcp-base";
import {
  CapabilityRuntime,
  processTransportService,
  type ProcessTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("MCP server renderer bridge", () => {
  it("authenticates renderer registration with caller identity", async () => {
    const transport = {
      call: vi.fn(async () => ({ ok: true })),
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(async () => undefined),
    } as unknown as ProcessTransport;
    const runtime = new CapabilityRuntime({
      profileId: "mcp-server-renderer-bridge",
      plugins: [
        {
          id: "mcp-server-native",
          manifest: {
            schemaVersion: 3,
            id: "mcp-server-native",
            name: "MCP Server",
            description: "Focused renderer bridge fixture.",
            category: "Test",
            version: "1.0.0",
            entrypoints: { renderer: "src/renderer.ts" },
            dependencies: {},
          },
          source: {
            type: "local",
            module: "mcp-server-native",
            location: "mcp-server-native",
          },
        },
      ],
      activationOrder: ["mcp-server-native"],
    });
    runtime.installExternalCapability(
      processTransportService,
      "kernel",
      transport,
    );
    await runtime.activate("mcp-server-native", plugin);

    const server = runtime.platformCapability<McpServerCapability>(
      MCP_SERVER_SERVICE,
    );
    await server.invoke("mcp_bridge_register", {
      receiver: { __termcoChannel: 7 },
    });

    expect(transport.call).toHaveBeenCalledExactlyOnceWith(
      MCP_SERVER_SERVICE,
      "invoke",
      ["mcp_bridge_register", { receiver: { __termcoChannel: 7 } }],
      { caller: true },
    );
  });
});
