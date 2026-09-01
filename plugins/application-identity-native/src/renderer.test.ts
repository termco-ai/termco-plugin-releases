import {
  CapabilityRuntime,
  processTransportService,
  type ProcessTransport,
} from "@termco/kernel";
import type {
  ApplicationBrandingCapability,
  ApplicationInfoCapability,
} from "@termco/application-base";
import { describe, expect, it } from "vitest";
import plugin from "./renderer";

function manifest(id: string) {
  return {
    schemaVersion: 3,
    id,
    name: id,
    description: id,
    category: "Test",
    version: "1.0.0",
    entrypoints: { renderer: "src/renderer.ts" },
    dependencies: {},
  };
}

describe("application identity ownership", () => {
  it("keeps info and branding stable while About leaves and returns", async () => {
    const identityPlugin = manifest("application-identity-native");
    const aboutPlugin = manifest("about-native");
    const runtime = new CapabilityRuntime({
      profileId: "test.application-identity",
      plugins: [identityPlugin, aboutPlugin].map((entry) => ({
        id: entry.id,
        manifest: entry,
        source: {
          type: "local",
          module: entry.id,
          location: entry.id,
          integrity: entry.id,
        },
      })),
      activationOrder: [identityPlugin.id, aboutPlugin.id],
    } as never);
    const transport: ProcessTransport = {
      call: async () => ({
        name: "Termco",
        version: "1.2.3",
        bundleId: "app.termco",
        platform: "darwin",
        architecture: "arm64",
      }),
      registerChannel: () => ({ __termcoChannel: 1 }),
      releaseChannel: () => {},
      releaseRemote: async () => {},
    };
    runtime.installExternalCapabilityFactory(
      processTransportService,
      "kernel",
      () => transport,
    );

    await runtime.activate(identityPlugin.id, plugin);
    const branding = runtime.platformCapability<ApplicationBrandingCapability>(
      "application.branding",
    );
    const info = runtime.platformCapability<ApplicationInfoCapability>(
      "application.info",
    );
    expect(branding.logoUrl).toContain("termco-icon.png");
    expect(branding.logoUrl).toContain("/application-identity-native/assets/");
    await expect(info.getInfo()).resolves.toMatchObject({ name: "Termco" });

    const activateAbout = () =>
      runtime.activate(aboutPlugin.id, {
        inject: ["application.info", "application.branding"],
        activate(context) {
          context.get("application.info");
          context.get("application.branding");
        },
      });
    await activateAbout();
    await runtime.deactivate(aboutPlugin.id);
    expect(runtime.platformCapability("application.branding")).toBe(branding);
    expect(runtime.platformCapability("application.info")).toBe(info);
    expect(runtime.lifecycleDiagnostics(identityPlugin.id).successfulActivations).toBe(
      1,
    );
    await activateAbout();
    expect(runtime.platformCapability("application.branding")).toBe(branding);
  });
});
