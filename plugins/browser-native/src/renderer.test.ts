import {
  BROWSER_AUTOMATION_SERVICE,
  type BrowserAutomationCapability,
} from "@termco/browser-base";
import {
  CapabilityRuntime,
  processTransportService,
  type ProcessTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("browser renderer bridge", () => {
  it("authenticates every automation call with renderer caller identity", async () => {
    const transport = {
      call: vi.fn(async () => null),
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(async () => undefined),
    } as unknown as ProcessTransport;
    const runtime = new CapabilityRuntime({
      profileId: "browser-renderer-bridge",
      plugins: [
        {
          id: "browser-native",
          manifest: {
            schemaVersion: 3,
            id: "browser-native",
            name: "Browser",
            description: "Browser renderer bridge fixture.",
            category: "Test",
            version: "1.0.0",
            entrypoints: { renderer: "src/renderer.ts" },
            dependencies: {},
          },
          source: {
            type: "local",
            module: "browser-native",
            location: "browser-native",
          },
        },
      ],
      activationOrder: ["browser-native"],
    });
    runtime.installExternalCapability(
      processTransportService,
      "kernel",
      transport,
    );
    await runtime.activate("browser-native", plugin);

    const browser = runtime.platformCapability<BrowserAutomationCapability>(
      BROWSER_AUTOMATION_SERVICE,
    );
    await browser.invoke("browser_get_state", { tabId: 4 });

    expect(transport.call).toHaveBeenCalledExactlyOnceWith(
      BROWSER_AUTOMATION_SERVICE,
      "invoke",
      ["browser_get_state", { tabId: 4 }],
      { caller: true },
    );
  });
});
