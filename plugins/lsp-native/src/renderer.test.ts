import {
  LSP_SESSIONS_SERVICE,
  type LspSessionsCapability,
} from "@termco/editor-base";
import {
  CapabilityRuntime,
  processTransportService,
  type ProcessTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("LSP renderer bridge", () => {
  it("authenticates document calls with renderer caller identity", async () => {
    const transport = {
      call: vi.fn(async () => ({ active: true })),
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(async () => undefined),
    } as unknown as ProcessTransport;
    const runtime = new CapabilityRuntime({
      profileId: "lsp-renderer-bridge",
      plugins: [
        {
          id: "lsp-native",
          manifest: {
            schemaVersion: 3,
            id: "lsp-native",
            name: "LSP",
            description: "Focused renderer bridge fixture.",
            category: "Test",
            version: "1.0.0",
            entrypoints: { renderer: "src/renderer.ts" },
            dependencies: {},
          },
          source: {
            type: "local",
            module: "lsp-native",
            location: "lsp-native",
          },
        },
      ],
      activationOrder: ["lsp-native"],
    });
    runtime.installExternalCapability(
      processTransportService,
      "kernel",
      transport,
    );
    await runtime.activate("lsp-native", plugin);

    const lsp = runtime.platformCapability<LspSessionsCapability>(
      LSP_SESSIONS_SERVICE,
    );
    const invoke = lsp.invoke as unknown as (
      command: string,
      payload: Record<string, unknown>,
    ) => Promise<unknown>;
    await invoke("lsp_doc_open", { path: "/workspace/demo.fk" });

    expect(transport.call).toHaveBeenCalledExactlyOnceWith(
      LSP_SESSIONS_SERVICE,
      "invoke",
      ["lsp_doc_open", { path: "/workspace/demo.fk" }],
      { caller: true },
    );
  });
});
